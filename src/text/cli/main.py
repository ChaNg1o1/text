"""CLI entry point for the text forensics platform.

Command structure::

    text analyze full|verify|closed-set-id|open-set-id|cluster|profile|sockpuppet <input>
    text extract <input>
    text config info|backends
    text config cache status|clear
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from pathlib import Path
from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from text.app_settings import AppSettingsStore
from text.ingest.loader import load_from_path
from text.ingest.schema import AnalysisRequest, FeatureVector, ForensicReport, TaskParams, TaskType
from text.llm.backend import LLMBackend, load_backends_config
from text.report.renderer import ReportRenderer

# ------------------------------------------------------------------
# App hierarchy
# ------------------------------------------------------------------

app = typer.Typer(
    name="text",
    help="Clue-first text investigation platform",
    no_args_is_help=True,
    rich_markup_mode="rich",
)

analyze_app = typer.Typer(
    name="analyze",
    help="Run forensic text analysis",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
app.add_typer(analyze_app)

config_app = typer.Typer(
    name="config",
    help="Configuration and diagnostics",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
app.add_typer(config_app)

cache_app = typer.Typer(
    name="cache",
    help="Feature cache management",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
config_app.add_typer(cache_app)

console = Console()
logger = logging.getLogger("text")


# ------------------------------------------------------------------
# Global callback (--version, --verbose)
# ------------------------------------------------------------------


def _version_callback(value: bool) -> None:
    if value:
        from text import __version__

        console.print(f"text v{__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: Annotated[
        bool,
        typer.Option(
            "--version",
            "-V",
            help="Show version and exit",
            callback=_version_callback,
            is_eager=True,
        ),
    ] = False,
    verbose: Annotated[
        bool,
        typer.Option("--verbose", "-v", help="Enable verbose logging"),
    ] = False,
) -> None:
    """Clue-first text investigation platform."""
    _configure_logging(verbose)


# ------------------------------------------------------------------
# Shared helpers
# ------------------------------------------------------------------


def _configure_logging(verbose: bool) -> None:
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, show_path=False, rich_tracebacks=True)],
    )


def _load_data(path: Path) -> AnalysisRequest:
    """Load input data with a spinner."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        progress.add_task(f"Loading {path.name}...", total=None)
        try:
            request = load_from_path(path)
        except (
            FileNotFoundError,
            ValueError,
            UnicodeDecodeError,
            PermissionError,
            json.JSONDecodeError,
        ) as exc:
            console.print(f"[bold red]Error:[/bold red] {exc}")
            raise typer.Exit(code=1) from None

    n = len(request.texts)
    if n == 0:
        console.print("[bold red]Error:[/bold red] No text entries found in input.")
        raise typer.Exit(code=1)
    authors = sorted({t.author for t in request.texts})
    console.print(
        f"  Loaded [bold green]{n}[/bold green] text(s) from [bold]{len(authors)}[/bold] author(s)"
    )
    return request


async def _extract_features(
    request: AnalysisRequest,
    *,
    no_cache: bool = False,
) -> list[FeatureVector]:
    """Shared feature extraction with progress display.

    Raises ``ImportError`` when the extraction module is not installed.
    """
    from text.features.cache import FeatureCache
    from text.features.extractor import FeatureExtractor

    cache = None if no_cache else FeatureCache()
    extractor = FeatureExtractor(cache=cache)

    try:
        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]{task.description}"),
            console=console,
            transient=True,
        ) as progress:
            progress.add_task("Extracting features...", total=None)
            vectors = await extractor.extract_batch(request.texts)

        console.print(f"  Extracted features for [bold green]{len(vectors)}[/bold green] text(s)")
        return vectors
    finally:
        if cache is not None:
            await cache.close()


def _resolve_backend(llm: str, config: Path | None) -> str:
    """Resolve backend name from custom backends and fail fast on invalid names."""
    all_backends = LLMBackend.available_backends(config_path=config)
    normalized = llm.strip()
    if normalized in {"", "default"}:
        if not all_backends:
            console.print(
                "[bold red]Error:[/bold red] No custom LLM backend configured. "
                "Create one in backends.json first."
            )
            raise typer.Exit(code=1)
        return all_backends[0]

    if normalized not in all_backends:
        valid = ", ".join(all_backends) or "(none)"
        console.print(
            f"[bold red]Error:[/bold red] Unknown LLM backend '{llm}'. Available: {valid}"
        )
        raise typer.Exit(code=1)
    return normalized


async def _run_analysis(
    request: AnalysisRequest,
    backend_name: str,
    no_cache: bool,
    config: Path | None = None,
) -> ForensicReport:
    """Full pipeline: feature extraction -> agent analysis -> report."""
    # Feature extraction
    feature_vectors: list[FeatureVector] | None = None
    try:
        feature_vectors = await _extract_features(request, no_cache=no_cache)
    except ImportError:
        console.print("  [dim]Feature extraction module not available — skipping.[/dim]")
    except Exception as exc:
        console.print(f"  [yellow]Feature extraction failed: {exc}[/yellow]")

    # Agent analysis
    try:
        from text.agents.orchestrator import OrchestratorAgent

        app_settings = AppSettingsStore().load()
        orchestrator = OrchestratorAgent(
            llm_backend=backend_name,
            config_path=config,
            prompt_overrides=app_settings.prompt_overrides,
        )

        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]{task.description}"),
            console=console,
            transient=True,
        ) as progress:
            progress.add_task("Running agent analysis...", total=None)
            report = await orchestrator.analyze(feature_vectors or [], request)

        console.print(
            f"  Completed analysis from "
            f"[bold green]{len(report.agent_reports)}[/bold green] agent(s)"
        )
        return report
    except ImportError:
        console.print("  [dim]Agent module not available — skipping LLM analysis.[/dim]")
    except EnvironmentError as exc:
        console.print(f"  [bold red]LLM configuration error:[/bold red] {exc}")
        raise typer.Exit(code=1) from None
    except Exception as exc:
        console.print(f"  [yellow]Agent analysis failed: {exc}[/yellow]")

    return ForensicReport(request=request)


def _emit_report(report: ForensicReport, fmt: str, output: Path | None) -> None:
    """Output report to file and/or terminal."""
    if output is not None:
        # Write file (rich → markdown when writing to disk)
        file_fmt = "markdown" if fmt == "rich" else fmt
        rendered = (
            ReportRenderer.to_json(report)
            if file_fmt == "json"
            else ReportRenderer.to_markdown(report)
        )
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
        console.print(f"\n  Report written to [bold]{output}[/bold]")
        return

    # Terminal display
    console.print()
    if fmt == "rich":
        ReportRenderer.to_rich(report, console)
    elif fmt == "json":
        console.print(ReportRenderer.to_json(report))
    else:
        console.print(Markdown(ReportRenderer.to_markdown(report)))


# ------------------------------------------------------------------
# Reusable option type aliases
# ------------------------------------------------------------------

InputArg = Annotated[Path, typer.Argument(help="Input file or directory (CSV/JSON/TXT/JSONL)")]
LlmOpt = Annotated[str, typer.Option("--llm", help="Custom backend name (from backends.json)")]
FormatOpt = Annotated[str, typer.Option("--format", "-f", help="Output format: rich|markdown|json")]
OutputOpt = Annotated[
    Optional[Path], typer.Option("--output", "-o", help="Write report to file (default: terminal)")
]
NoCacheOpt = Annotated[bool, typer.Option("--no-cache", help="Disable feature caching")]
ConfigOpt = Annotated[Optional[Path], typer.Option("--config", help="Path to backends.json")]


# ------------------------------------------------------------------
# analyze subcommands
# ------------------------------------------------------------------


def _analyze(
    input_path: Path,
    task_type: TaskType,
    llm: str,
    fmt: str,
    output: Path | None,
    no_cache: bool,
    config: Path | None,
    *,
    task_params: TaskParams | None = None,
) -> None:
    """Shared entry point for all analyze subcommands."""
    console.print(
        Panel("[bold]Digital Forensics Text Analysis[/bold]", border_style="blue", padding=(0, 2))
    )

    resolved_backend = _resolve_backend(llm, config)

    request = _load_data(input_path)
    request.task = task_type
    request.llm_backend = resolved_backend
    request.task_params = task_params or TaskParams()

    # Default output: save report to a file in the current working directory.
    if output is None:
        stem = input_path.stem if input_path.is_file() else input_path.name
        ext = ".json" if fmt == "json" else ".md"
        output = Path.cwd() / f"report_{stem}{ext}"

    console.print()
    try:
        report = asyncio.run(_run_analysis(request, resolved_backend, no_cache, config))
    except KeyboardInterrupt:
        console.print("\n[dim]分析已取消。[/dim]")
        raise typer.Exit(code=130) from None

    _emit_report(report, fmt, output)


@analyze_app.command("full")
def analyze_full(
    input: InputArg,
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Comprehensive analysis (attribution + profiling + sockpuppet)."""
    _analyze(input, TaskType.FULL, llm, format, output, no_cache, config)


def _split_csv_arg(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@analyze_app.command("verify")
def analyze_verification(
    input: InputArg,
    questioned: Annotated[
        str,
        typer.Option("--questioned", help="Comma-separated questioned text IDs"),
    ],
    reference_authors: Annotated[
        str,
        typer.Option("--reference-authors", help="Comma-separated reference author IDs"),
    ],
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Authorship verification analysis."""
    _analyze(
        input,
        TaskType.VERIFICATION,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(
            questioned_text_ids=_split_csv_arg(questioned),
            reference_author_ids=_split_csv_arg(reference_authors),
        ),
    )


@analyze_app.command("closed-set-id")
def analyze_closed_set_id(
    input: InputArg,
    questioned: Annotated[
        str,
        typer.Option("--questioned", help="Comma-separated questioned text IDs"),
    ],
    candidates: Annotated[
        str,
        typer.Option("--candidates", help="Comma-separated candidate author IDs"),
    ],
    top_k: Annotated[int, typer.Option("--top-k", help="Number of ranked candidates to include")] = 3,
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Closed-set identification."""
    _analyze(
        input,
        TaskType.CLOSED_SET_ID,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(
            questioned_text_ids=_split_csv_arg(questioned),
            candidate_author_ids=_split_csv_arg(candidates),
            top_k=top_k,
        ),
    )


@analyze_app.command("open-set-id")
def analyze_open_set_id(
    input: InputArg,
    questioned: Annotated[
        str,
        typer.Option("--questioned", help="Comma-separated questioned text IDs"),
    ],
    candidates: Annotated[
        str,
        typer.Option("--candidates", help="Comma-separated candidate author IDs"),
    ],
    top_k: Annotated[int, typer.Option("--top-k", help="Number of ranked candidates to include")] = 3,
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Open-set identification with rejection."""
    _analyze(
        input,
        TaskType.OPEN_SET_ID,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(
            questioned_text_ids=_split_csv_arg(questioned),
            candidate_author_ids=_split_csv_arg(candidates),
            top_k=top_k,
        ),
    )


@analyze_app.command("cluster")
def analyze_cluster(
    input: InputArg,
    text_ids: Annotated[
        Optional[str],
        typer.Option("--texts", help="Optional comma-separated text IDs to cluster"),
    ] = None,
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Unsupervised clustering by writing fingerprints."""
    _analyze(
        input,
        TaskType.CLUSTERING,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(cluster_text_ids=_split_csv_arg(text_ids)),
    )


@analyze_app.command("profile")
def analyze_profiling(
    input: InputArg,
    subjects: Annotated[
        Optional[str],
        typer.Option("--subjects", help="Optional comma-separated subject/author IDs"),
    ] = None,
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Observable writing profile analysis."""
    _analyze(
        input,
        TaskType.PROFILING,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(subject_ids=_split_csv_arg(subjects)),
    )


@analyze_app.command("sockpuppet")
def analyze_sockpuppet(
    input: InputArg,
    accounts: Annotated[
        str,
        typer.Option("--accounts", help="Comma-separated account IDs"),
    ],
    llm: LlmOpt = "default",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Sockpuppet / sybil account detection."""
    _analyze(
        input,
        TaskType.SOCKPUPPET,
        llm,
        format,
        output,
        no_cache,
        config,
        task_params=TaskParams(account_ids=_split_csv_arg(accounts)),
    )


# ------------------------------------------------------------------
# extract (top-level command)
# ------------------------------------------------------------------


@app.command()
def extract(
    input: Annotated[Path, typer.Argument(help="Input file or directory (CSV/JSON/TXT/JSONL)")],
    output: Annotated[Path, typer.Option("--output", "-o", help="Output file path")] = Path(
        "features.json"
    ),
    format: Annotated[
        str, typer.Option("--format", "-f", help="Output format: json|parquet")
    ] = "json",
    no_cache: NoCacheOpt = False,
) -> None:
    """Extract text features without LLM analysis."""
    request = _load_data(input)

    try:
        vectors = asyncio.run(_extract_features(request, no_cache=no_cache))
    except ImportError:
        console.print(
            "[bold red]Error:[/bold red] Feature extraction module is not available. "
            "Ensure the Rust extension and/or NLP dependencies are installed."
        )
        raise typer.Exit(code=1) from None
    except KeyboardInterrupt:
        console.print("\n[dim]特征提取已取消。[/dim]")
        raise typer.Exit(code=130) from None

    if format == "json":
        data = [v.model_dump() for v in vectors]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    elif format == "parquet":
        try:
            import pandas as pd  # type: ignore[import-untyped]

            data = [v.model_dump() for v in vectors]
            df = pd.json_normalize(data)  # type: ignore[attr-defined]
            output.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(output, index=False)
        except ImportError:
            console.print(
                "[bold red]Error:[/bold red] Parquet output requires pandas and pyarrow. "
                "Install with: pip install pandas pyarrow"
            )
            raise typer.Exit(code=1) from None
    else:
        console.print(
            f"[bold red]Error:[/bold red] Unknown format '{format}'. Use 'json' or 'parquet'."
        )
        raise typer.Exit(code=1)

    console.print(f"  Written to [bold]{output}[/bold]")


@app.command("evaluate")
def evaluate_reference_corpus(
    input: Annotated[Path, typer.Argument(help="Reference corpus file or directory")],
    output: Annotated[
        Optional[Path],
        typer.Option("--output", "-o", help="Optional JSON output path"),
    ] = None,
    no_cache: NoCacheOpt = False,
) -> None:
    """Evaluate a labeled reference corpus and emit calibration-style metrics."""
    from text.decision import DecisionEngine

    request = _load_data(input)

    try:
        features = asyncio.run(_extract_features(request, no_cache=no_cache))
    except ImportError:
        console.print(
            "[bold red]Error:[/bold red] Feature extraction module is not available. "
            "Ensure the Rust extension and NLP dependencies are installed."
        )
        raise typer.Exit(code=1) from None
    except KeyboardInterrupt:
        console.print("\n[dim]评测已取消。[/dim]")
        raise typer.Exit(code=130) from None

    metrics = DecisionEngine().evaluate_reference_corpus(request, features)
    rendered = json.dumps(metrics, indent=2, ensure_ascii=False)

    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
        console.print(f"  Evaluation written to [bold]{output}[/bold]")
        return

    console.print(Panel(rendered, title="Reference Evaluation", border_style="blue"))


# ------------------------------------------------------------------
# config subcommands
# ------------------------------------------------------------------


@config_app.command("info")
def config_info() -> None:
    """Show installed components and system status."""
    from text import __version__

    console.print(
        Panel(
            f"[bold]text[/bold] v{__version__}\nClue-first text investigation platform",
            border_style="blue",
            padding=(0, 2),
        )
    )

    table = Table(
        title="Installed Components",
        show_header=True,
        header_style="bold cyan",
    )
    table.add_column("Component", style="bold")
    table.add_column("Status")
    table.add_column("Details")

    # Rust extension
    try:
        import text._tf_features as _rust  # type: ignore[import-untyped]

        table.add_row(
            "Rust feature extractor",
            "[green]installed[/green]",
            str(getattr(_rust, "__version__", "N/A")),
        )
    except ImportError:
        table.add_row(
            "Rust feature extractor",
            "[yellow]not installed[/yellow]",
            "Build with: maturin develop",
        )

    # spaCy
    try:
        import spacy

        table.add_row("spaCy", "[green]installed[/green]", f"v{spacy.__version__}")
        for model_name in ("en_core_web_sm", "en_core_web_lg"):
            if spacy.util.is_package(model_name):
                table.add_row(f"  {model_name}", "[green]available[/green]", "")
            else:
                table.add_row(
                    f"  {model_name}",
                    "[yellow]not downloaded[/yellow]",
                    f"python -m spacy download {model_name}",
                )
    except ImportError:
        table.add_row("spaCy", "[red]not installed[/red]", "pip install spacy")

    # sentence-transformers
    try:
        import sentence_transformers

        table.add_row(
            "sentence-transformers",
            "[green]installed[/green]",
            f"v{sentence_transformers.__version__}",
        )
    except ImportError:
        table.add_row(
            "sentence-transformers",
            "[yellow]not installed[/yellow]",
            "pip install sentence-transformers",
        )

    # litellm
    try:
        import litellm as _litellm

        table.add_row(
            "litellm",
            "[green]installed[/green]",
            f"v{getattr(_litellm, '__version__', 'unknown')}",
        )
    except ImportError:
        table.add_row("litellm", "[red]not installed[/red]", "pip install litellm")

    console.print(table)


@config_app.command("backends")
def config_backends(
    config: Annotated[
        Optional[Path],
        typer.Option("--config", help="Path to backends.json"),
    ] = None,
) -> None:
    """List available custom LLM backends from backends.json."""
    custom = load_backends_config(config)
    ctable = Table(
        title="Custom Backends (from backends.json)",
        show_header=True,
        header_style="bold cyan",
    )
    ctable.add_column("Name", style="bold")
    ctable.add_column("Provider")
    ctable.add_column("Model")
    ctable.add_column("API Base")
    ctable.add_column("Status")

    if not custom:
        ctable.add_row("(none)", "-", "-", "-", "[yellow]not configured[/yellow]")
        console.print(ctable)
        return

    for cname, cb in sorted(custom.items()):
        key = cb.resolve_api_key()
        if key:
            cstatus = "[green]ready[/green]"
        elif cb.api_key_env:
            cstatus = f"[yellow]no key ({cb.api_key_env})[/yellow]"
        else:
            cstatus = "[yellow]no key configured[/yellow]"
        ctable.add_row(cname, cb.provider, cb.model, cb.api_base, cstatus)

    console.print(ctable)


# ------------------------------------------------------------------
# cache subcommands
# ------------------------------------------------------------------


def _cache_dir() -> Path:
    try:
        from text.features.cache import FeatureCache

        return FeatureCache.DEFAULT_DB_DIR
    except ImportError:
        return Path.home() / ".cache" / "text"


@cache_app.command("status")
def cache_status() -> None:
    """Show feature cache size and location."""
    cache_dir = _cache_dir()
    if not cache_dir.exists():
        console.print(
            Panel(
                f"Cache directory: {cache_dir}\nStatus: empty (no cache files yet)",
                title="[bold]Cache Status[/bold]",
                border_style="dim",
            )
        )
        return

    cache_files = [f for f in cache_dir.rglob("*") if f.is_file()]
    total_size = sum(f.stat().st_size for f in cache_files)
    size_mb = total_size / (1024 * 1024)
    console.print(
        Panel(
            f"Cache directory: {cache_dir}\nFiles: {len(cache_files)}\nSize: {size_mb:.1f} MB",
            title="[bold]Cache Status[/bold]",
            border_style="dim",
        )
    )


@cache_app.command("clear")
def cache_clear(
    force: Annotated[
        bool,
        typer.Option("--force", "-f", help="Skip confirmation prompt"),
    ] = False,
) -> None:
    """Delete all cached feature data."""
    cache_dir = _cache_dir()
    if not cache_dir.exists():
        console.print("  Cache directory does not exist. Nothing to clear.")
        return

    cache_files = [f for f in cache_dir.rglob("*") if f.is_file()]
    if not cache_files:
        console.print("  Cache is already empty.")
        return

    total_size = sum(f.stat().st_size for f in cache_files)
    size_mb = total_size / (1024 * 1024)

    if not force:
        confirm = typer.confirm(
            f"Delete {len(cache_files)} file(s) ({size_mb:.1f} MB) from {cache_dir}?"
        )
        if not confirm:
            console.print("  Cancelled.")
            raise typer.Exit()

    shutil.rmtree(cache_dir)
    console.print(f"  Cleared [bold green]{size_mb:.1f} MB[/bold green] from {cache_dir}")
