"""CLI entry point for the text forensics platform.

Provides commands for forensic text analysis, feature extraction, and
system introspection.  Uses typer for argument parsing and rich for
beautiful terminal output.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn, TaskProgressColumn
from rich.table import Table

from text.ingest.loader import load_from_file
from text.ingest.schema import AnalysisRequest, ForensicReport, TaskType
from text.llm.backend import LLMBackend, load_backends_config
from text.report.renderer import ReportRenderer

app = typer.Typer(
    name="text",
    help="Digital forensics text analysis platform",
    no_args_is_help=True,
    rich_markup_mode="rich",
)
console = Console()

logger = logging.getLogger("text")


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------


def _configure_logging(verbose: bool) -> None:
    """Set up logging with rich handler."""
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(console=console, show_path=False, rich_tracebacks=True)],
    )


def _resolve_task(task: str) -> TaskType:
    """Convert a CLI task string into a TaskType enum value."""
    try:
        return TaskType(task.lower())
    except ValueError:
        valid = ", ".join(t.value for t in TaskType)
        console.print(f"[bold red]Error:[/bold red] Unknown task '{task}'. Valid: {valid}")
        raise typer.Exit(code=1) from None


def _load_data(path: Path) -> AnalysisRequest:
    """Load input data with a nice spinner."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]{task.description}"),
        console=console,
        transient=True,
    ) as progress:
        progress.add_task(f"Loading {path.name}...", total=None)
        try:
            request = load_from_file(path)
        except (FileNotFoundError, ValueError) as exc:
            console.print(f"[bold red]Error:[/bold red] {exc}")
            raise typer.Exit(code=1) from None

    n = len(request.texts)
    authors = sorted({t.author for t in request.texts})
    console.print(
        f"  Loaded [bold green]{n}[/bold green] text(s) "
        f"from [bold]{len(authors)}[/bold] author(s)"
    )
    return request


def _emit_report(
    report: ForensicReport,
    output: Path | None,
    fmt: str,
) -> None:
    """Write the report to file or console."""
    if fmt == "json":
        rendered = ReportRenderer.to_json(report)
    elif fmt == "markdown":
        rendered = ReportRenderer.to_markdown(report)
    else:
        console.print(
            f"[bold red]Error:[/bold red] Unknown format '{fmt}'. Use 'markdown' or 'json'."
        )
        raise typer.Exit(code=1)

    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered, encoding="utf-8")
        console.print(f"\n  Report written to [bold]{output}[/bold]")
    else:
        console.print()
        if fmt == "markdown":
            # Rich rendering for interactive terminals; raw Markdown to pipes
            if console.is_terminal:
                ReportRenderer.to_rich(report, console)
            else:
                console.print(rendered)
        else:
            console.print(rendered)


async def _run_analysis(
    request: AnalysisRequest,
    backend_name: str,
    no_cache: bool,
    config: Path | None = None,
) -> ForensicReport:
    """Orchestrate feature extraction and agent analysis.

    This is the main async pipeline.  It tries to import optional modules
    (features, agents) and degrades gracefully when they are absent.
    """
    # ------ Feature extraction ------
    feature_vectors: list | None = None
    try:
        from text.features.cache import FeatureCache
        from text.features.extractor import FeatureExtractor

        cache = None if no_cache else FeatureCache()
        extractor = FeatureExtractor(cache=cache)

        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
            transient=True,
        ) as progress:
            task = progress.add_task("Extracting features...", total=len(request.texts))
            vectors = []
            for entry in request.texts:
                vec = await extractor.extract(entry.content, entry.id)
                vectors.append(vec)
                progress.update(task, advance=1)
            feature_vectors = vectors

        console.print(
            f"  Extracted features for [bold green]{len(feature_vectors)}[/bold green] text(s)"
        )
    except ImportError:
        console.print("  [dim]Feature extraction module not available — skipping.[/dim]")
    except Exception as exc:
        console.print(f"  [yellow]Feature extraction failed: {exc}[/yellow]")

    # ------ Agent analysis ------
    agent_reports: list = []
    try:
        from text.agents.orchestrator import OrchestratorAgent

        orchestrator = OrchestratorAgent(llm_backend=backend_name, config_path=config)

        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]{task.description}"),
            console=console,
            transient=True,
        ) as progress:
            progress.add_task("Running agent analysis...", total=None)
            report = await orchestrator.analyze(feature_vectors or [], request)

        console.print(
            f"  Completed analysis from [bold green]{len(report.agent_reports)}[/bold green] agent(s)"
        )
        return report

    except ImportError:
        console.print("  [dim]Agent module not available — skipping LLM analysis.[/dim]")
    except EnvironmentError as exc:
        console.print(f"  [bold red]LLM configuration error:[/bold red] {exc}")
        raise typer.Exit(code=1) from None
    except Exception as exc:
        console.print(f"  [yellow]Agent analysis failed: {exc}[/yellow]")

    # ------ Assemble report (fallback when agents unavailable) ------
    report = ForensicReport(
        request=request,
        agent_reports=agent_reports,
    )
    return report


# ------------------------------------------------------------------
# Commands
# ------------------------------------------------------------------


@app.command()
def analyze(
    input: Annotated[
        Path,
        typer.Argument(help="Input file (CSV/JSON/TXT/JSONL)", exists=True, readable=True),
    ],
    task: Annotated[
        str,
        typer.Option(help="Analysis task: attribution|profiling|sockpuppet|full"),
    ] = "full",
    llm: Annotated[
        str,
        typer.Option(help="LLM backend: claude|gpt4|gpt4-mini|local"),
    ] = "claude",
    output: Annotated[
        Optional[Path],
        typer.Option(help="Output file path (default: stdout)"),
    ] = None,
    format: Annotated[
        str,
        typer.Option(help="Output format: markdown|json"),
    ] = "markdown",
    compare: Annotated[
        Optional[list[str]],
        typer.Option(help="Author groups to compare (for attribution)"),
    ] = None,
    author: Annotated[
        Optional[str],
        typer.Option(help="Specific author to profile"),
    ] = None,
    suspects: Annotated[
        Optional[str],
        typer.Option(help="Comma-separated suspect authors (for sockpuppet)"),
    ] = None,
    no_cache: Annotated[
        bool,
        typer.Option("--no-cache", help="Disable feature caching"),
    ] = False,
    config: Annotated[
        Optional[Path],
        typer.Option("--config", help="Path to backends.json for custom LLM endpoints"),
    ] = None,
    verbose: Annotated[
        bool,
        typer.Option("-v", "--verbose", help="Verbose output"),
    ] = False,
) -> None:
    """Run forensic text analysis."""
    _configure_logging(verbose)

    console.print(
        Panel(
            "[bold]Digital Forensics Text Analysis[/bold]",
            border_style="blue",
            padding=(0, 2),
        )
    )

    # Validate backend early to fail fast.
    all_backends = LLMBackend.available_backends(config_path=config)
    if llm not in all_backends and "/" not in llm:
        valid = ", ".join(all_backends)
        console.print(f"[bold red]Error:[/bold red] Unknown LLM backend '{llm}'. Available: {valid}")
        raise typer.Exit(code=1)

    task_type = _resolve_task(task)
    request = _load_data(input)
    request.task = task_type
    request.llm_backend = llm

    # Apply optional filters.
    if compare:
        request.compare_groups = [g.split(",") for g in compare]
    if author:
        request.texts = [t for t in request.texts if t.author == author]
        if not request.texts:
            console.print(f"[bold red]Error:[/bold red] No texts found for author '{author}'.")
            raise typer.Exit(code=1)
    if suspects:
        suspect_list = [s.strip() for s in suspects.split(",")]
        request.texts = [t for t in request.texts if t.author in suspect_list]
        if not request.texts:
            console.print(
                f"[bold red]Error:[/bold red] No texts found for suspect(s): {suspects}"
            )
            raise typer.Exit(code=1)

    console.print()
    report = asyncio.run(_run_analysis(request, llm, no_cache, config))
    _emit_report(report, output, format)

    # Show usage stats if verbose.
    if verbose:
        console.print("\n[dim]Analysis complete.[/dim]")


@app.command()
def features(
    input: Annotated[
        Path,
        typer.Argument(help="Input file (CSV/JSON/TXT/JSONL)", exists=True, readable=True),
    ],
    output: Annotated[
        Path,
        typer.Option(help="Output file path"),
    ] = Path("features.json"),
    format: Annotated[
        str,
        typer.Option(help="Output format: json|parquet"),
    ] = "json",
) -> None:
    """Extract and export features only (no LLM analysis)."""
    _configure_logging(verbose=False)

    request = _load_data(input)

    try:
        from text.features.extractor import FeatureExtractor
    except ImportError:
        console.print(
            "[bold red]Error:[/bold red] Feature extraction module is not available. "
            "Ensure the Rust extension and/or NLP dependencies are installed."
        )
        raise typer.Exit(code=1) from None

    extractor = FeatureExtractor()

    async def _extract_all():
        with Progress(
            SpinnerColumn(),
            TextColumn("[bold blue]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
            console=console,
        ) as progress:
            task = progress.add_task("Extracting features...", total=len(request.texts))
            vectors = []
            for entry in request.texts:
                vec = await extractor.extract(entry.content, entry.id)
                vectors.append(vec)
                progress.update(task, advance=1)
        return vectors

    vectors = asyncio.run(_extract_all())

    console.print(
        f"  Extracted [bold green]{len(vectors)}[/bold green] feature vector(s)"
    )

    if format == "json":
        data = [v.model_dump() for v in vectors]
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
        console.print(f"  Written to [bold]{output}[/bold]")
    elif format == "parquet":
        try:
            import pandas as pd  # type: ignore[import-untyped]

            data = [v.model_dump() for v in vectors]
            df = pd.json_normalize(data)  # type: ignore[attr-defined]
            output.parent.mkdir(parents=True, exist_ok=True)
            df.to_parquet(output, index=False)
            console.print(f"  Written to [bold]{output}[/bold]")
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


@app.command()
def backends(
    config: Annotated[
        Optional[Path],
        typer.Option("--config", help="Path to backends.json for custom LLM endpoints"),
    ] = None,
) -> None:
    """List available LLM backends (built-in and custom)."""
    # ---- Built-in backends ----
    table = Table(
        title="Built-in Backends",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Name", style="bold")
    table.add_column("Model Identifier")
    table.add_column("Status")

    for name in sorted(LLMBackend.MODEL_MAP):
        model_id = LLMBackend.MODEL_MAP[name]
        try:
            _ = LLMBackend(backend=name)
            status = "[green]ready[/green]"
        except EnvironmentError:
            status = "[yellow]no API key[/yellow]"
        except Exception:
            status = "[red]error[/red]"
        table.add_row(name, model_id, status)

    console.print(table)

    # ---- Custom backends ----
    custom = load_backends_config(config)
    if custom:
        console.print()
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

        for name, cb in sorted(custom.items()):
            key = cb.resolve_api_key()
            if key:
                status = "[green]ready[/green]"
            elif cb.api_key_env:
                status = f"[yellow]no key ({cb.api_key_env})[/yellow]"
            else:
                status = "[yellow]no key configured[/yellow]"
            ctable.add_row(name, cb.provider, cb.model, cb.api_base, status)

        console.print(ctable)


@app.command()
def info() -> None:
    """Show system information and available components."""
    from text import __version__

    console.print(
        Panel(
            f"[bold]text[/bold] v{__version__}\nDigital forensics text analysis platform",
            border_style="blue",
            padding=(0, 2),
        )
    )

    # ---- Components Table ----
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

        table.add_row("Rust feature extractor", "[green]installed[/green]", str(getattr(_rust, "__version__", "N/A")))
    except ImportError:
        table.add_row("Rust feature extractor", "[yellow]not installed[/yellow]", "Build with: maturin develop")

    # spaCy
    try:
        import spacy

        table.add_row("spaCy", "[green]installed[/green]", f"v{spacy.__version__}")
        # Check for common models.
        for model_name in ("en_core_web_sm", "en_core_web_lg"):
            try:
                spacy.load(model_name)
                table.add_row(f"  {model_name}", "[green]available[/green]", "")
            except OSError:
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

        table.add_row("litellm", "[green]installed[/green]", f"v{_litellm.__version__}")
    except ImportError:
        table.add_row("litellm", "[red]not installed[/red]", "pip install litellm")

    console.print(table)
    console.print()

    # ---- LLM Backends ----
    backends(config=None)

    # ---- Cache Status ----
    console.print()
    cache_dir = Path.home() / ".cache" / "text"
    if cache_dir.exists():
        cache_files = list(cache_dir.rglob("*"))
        total_size = sum(f.stat().st_size for f in cache_files if f.is_file())
        size_mb = total_size / (1024 * 1024)
        console.print(
            Panel(
                f"Cache directory: {cache_dir}\n"
                f"Files: {len(cache_files)}\n"
                f"Size: {size_mb:.1f} MB",
                title="[bold]Cache Status[/bold]",
                border_style="dim",
            )
        )
    else:
        console.print(
            Panel(
                f"Cache directory: {cache_dir}\nStatus: empty (no cache files yet)",
                title="[bold]Cache Status[/bold]",
                border_style="dim",
            )
        )
