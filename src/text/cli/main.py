"""CLI entry point for the text forensics platform.

Command structure::

    text analyze full|attribution|profiling|sockpuppet <input>
    text extract <input>
    text config info|backends
    text config cache status|clear
    text serve
    text webui
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Annotated, Optional, Sequence

import typer
from rich.console import Console
from rich.logging import RichHandler
from rich.markdown import Markdown
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table

from text.ingest.loader import load_from_path
from text.ingest.schema import AnalysisRequest, FeatureVector, ForensicReport, TaskType
from text.llm.backend import LLMBackend, load_backends_config
from text.report.renderer import ReportRenderer

# ------------------------------------------------------------------
# App hierarchy
# ------------------------------------------------------------------

app = typer.Typer(
    name="text",
    help="Digital forensics text analysis platform",
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

serve_app = typer.Typer(
    name="serve",
    help="Start the web API server",
    no_args_is_help=False,
    rich_markup_mode="rich",
    invoke_without_command=True,
)
app.add_typer(serve_app)

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
    """Digital forensics text analysis platform."""
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


def _validate_backend(llm: str, config: Path | None) -> None:
    """Fail fast on unknown LLM backend."""
    all_backends = LLMBackend.available_backends(config_path=config)
    if llm not in all_backends and "/" not in llm:
        valid = ", ".join(all_backends)
        console.print(
            f"[bold red]Error:[/bold red] Unknown LLM backend '{llm}'. Available: {valid}"
        )
        raise typer.Exit(code=1)


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
LlmOpt = Annotated[str, typer.Option("--llm", help="LLM backend name or litellm model ID")]
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
    compare: list[str] | None = None,
    author: str | None = None,
    suspects: str | None = None,
) -> None:
    """Shared entry point for all analyze subcommands."""
    console.print(
        Panel("[bold]Digital Forensics Text Analysis[/bold]", border_style="blue", padding=(0, 2))
    )

    _validate_backend(llm, config)

    request = _load_data(input_path)
    request.task = task_type
    request.llm_backend = llm

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
            console.print(f"[bold red]Error:[/bold red] No texts found for suspect(s): {suspects}")
            raise typer.Exit(code=1)

    # Default output: save report to a file in the current working directory.
    if output is None:
        stem = input_path.stem if input_path.is_file() else input_path.name
        ext = ".json" if fmt == "json" else ".md"
        output = Path.cwd() / f"report_{stem}{ext}"

    console.print()
    try:
        report = asyncio.run(_run_analysis(request, llm, no_cache, config))
    except KeyboardInterrupt:
        console.print("\n[dim]分析已取消。[/dim]")
        raise typer.Exit(code=130) from None

    _emit_report(report, fmt, output)


@analyze_app.command("full")
def analyze_full(
    input: InputArg,
    llm: LlmOpt = "claude",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Comprehensive analysis (attribution + profiling + sockpuppet)."""
    _analyze(input, TaskType.FULL, llm, format, output, no_cache, config)


@analyze_app.command("attribution")
def analyze_attribution(
    input: InputArg,
    compare: Annotated[
        Optional[list[str]],
        typer.Option("--compare", help="Author groups to compare (comma-separated per group)"),
    ] = None,
    llm: LlmOpt = "claude",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Authorship attribution analysis."""
    _analyze(input, TaskType.ATTRIBUTION, llm, format, output, no_cache, config, compare=compare)


@analyze_app.command("profiling")
def analyze_profiling(
    input: InputArg,
    author: Annotated[
        Optional[str],
        typer.Option("--author", help="Specific author to profile"),
    ] = None,
    llm: LlmOpt = "claude",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Author profiling and linguistic fingerprinting."""
    _analyze(input, TaskType.PROFILING, llm, format, output, no_cache, config, author=author)


@analyze_app.command("sockpuppet")
def analyze_sockpuppet(
    input: InputArg,
    suspects: Annotated[
        Optional[str],
        typer.Option("--suspects", help="Comma-separated suspect author names"),
    ] = None,
    llm: LlmOpt = "claude",
    format: FormatOpt = "rich",
    output: OutputOpt = None,
    no_cache: NoCacheOpt = False,
    config: ConfigOpt = None,
) -> None:
    """Sockpuppet / sybil account detection."""
    _analyze(input, TaskType.SOCKPUPPET, llm, format, output, no_cache, config, suspects=suspects)


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


# ------------------------------------------------------------------
# config subcommands
# ------------------------------------------------------------------


@config_app.command("info")
def config_info() -> None:
    """Show installed components and system status."""
    from text import __version__

    console.print(
        Panel(
            f"[bold]text[/bold] v{__version__}\nDigital forensics text analysis platform",
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
    """List available LLM backends (built-in and custom)."""
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


# ------------------------------------------------------------------
# serve + webui commands
# ------------------------------------------------------------------


def _resolve_default_web_dir() -> Path:
    """Resolve the bundled Next.js web app directory."""
    return Path(__file__).resolve().parents[3] / "web"


def _browser_api_host(api_host: str) -> str:
    """Convert wildcard bind hosts to a browser-reachable host."""
    if api_host in {"0.0.0.0", "::"}:
        return "127.0.0.1"
    return api_host


def _spawn_process(
    cmd: Sequence[str],
    *,
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
) -> subprocess.Popen:
    kwargs: dict[str, object] = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(
        list(cmd),
        cwd=str(cwd) if cwd is not None else None,
        env=env,
        **kwargs,
    )


def _stop_process(proc: subprocess.Popen, *, name: str) -> None:
    """Terminate a process group (or process) gracefully, then force kill if needed."""
    if proc.poll() is not None:
        return

    def _send(sig: int) -> None:
        try:
            if os.name == "nt":
                proc.terminate() if sig == signal.SIGTERM else proc.kill()
            else:
                os.killpg(proc.pid, sig)
        except ProcessLookupError:
            return

    _send(signal.SIGTERM)
    try:
        proc.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        console.print(f"[yellow]{name} did not stop in time, forcing shutdown...[/yellow]")

    _send(signal.SIGKILL)
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        pass


@serve_app.callback(invoke_without_command=True)
def serve(
    host: Annotated[str, typer.Option("--host", help="Bind address")] = "127.0.0.1",
    port: Annotated[int, typer.Option("--port", "-p", help="Bind port")] = 8000,
    reload: Annotated[bool, typer.Option("--reload", help="Auto-reload on code changes")] = False,
) -> None:
    """Start the web API server."""
    try:
        import uvicorn
    except ImportError:
        console.print(
            "[bold red]Error:[/bold red] Web dependencies not installed. "
            "Install with: pip install -e '.[web]'"
        )
        raise typer.Exit(code=1) from None

    console.print(
        Panel(
            f"[bold]Text Forensics Web API[/bold]\n"
            f"  Listening on http://{host}:{port}\n"
            f"  API docs: http://{host}:{port}/docs",
            border_style="blue",
            padding=(0, 2),
        )
    )

    uvicorn.run(
        "text.api.app:create_app",
        factory=True,
        host=host,
        port=port,
        reload=reload,
    )


@app.command("webui")
def webui(
    api_host: Annotated[
        str,
        typer.Option("--api-host", help="API bind address"),
    ] = "127.0.0.1",
    api_port: Annotated[
        int,
        typer.Option("--api-port", help="API bind port"),
    ] = 8000,
    api_reload: Annotated[
        bool,
        typer.Option(
            "--api-reload/--no-api-reload",
            help="Enable API auto-reload on code changes",
        ),
    ] = False,
    ui_host: Annotated[
        str,
        typer.Option("--ui-host", help="UI dev server hostname"),
    ] = "127.0.0.1",
    ui_port: Annotated[
        int,
        typer.Option("--ui-port", help="UI dev server port"),
    ] = 3000,
    web_dir: Annotated[
        Optional[Path],
        typer.Option("--web-dir", help="Path to Next.js web directory"),
    ] = None,
) -> None:
    """Start API and Next.js UI together for local development."""
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        console.print(
            "[bold red]Error:[/bold red] Web API dependencies not installed. "
            "Install with: pip install -e '.[web]'"
        )
        raise typer.Exit(code=1) from None

    npm_bin = shutil.which("npm")
    if npm_bin is None:
        console.print(
            "[bold red]Error:[/bold red] npm not found. Install Node.js first to run the web UI."
        )
        raise typer.Exit(code=1)

    resolved_web_dir = (web_dir or _resolve_default_web_dir()).expanduser().resolve()
    package_json = resolved_web_dir / "package.json"
    if not package_json.exists():
        console.print(
            f"[bold red]Error:[/bold red] Web directory is invalid: {resolved_web_dir}\n"
            "Expected to find package.json there."
        )
        raise typer.Exit(code=1)

    api_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "text.api.app:create_app",
        "--factory",
        "--host",
        api_host,
        "--port",
        str(api_port),
    ]
    if api_reload:
        api_cmd.append("--reload")

    api_origin = f"http://{_browser_api_host(api_host)}:{api_port}"
    ui_env = os.environ.copy()
    ui_env["TEXT_API_ORIGIN"] = api_origin
    ui_cmd = [npm_bin, "run", "dev", "--", "--hostname", ui_host, "--port", str(ui_port)]

    console.print(
        Panel(
            "[bold]Text Forensics WebUI[/bold]\n"
            f"  API: http://{_browser_api_host(api_host)}:{api_port}\n"
            f"  UI:  http://{ui_host}:{ui_port}\n"
            f"  API docs: http://{_browser_api_host(api_host)}:{api_port}/docs\n"
            "  Press Ctrl+C to stop both services.",
            border_style="blue",
            padding=(0, 2),
        )
    )

    api_proc: subprocess.Popen | None = None
    ui_proc: subprocess.Popen | None = None
    exit_code = 0
    try:
        api_proc = _spawn_process(api_cmd)
        time.sleep(0.8)
        if api_proc.poll() is not None:
            exit_code = api_proc.returncode or 1
            console.print(
                "[bold red]Error:[/bold red] API process exited immediately. "
                "Check logs above for details."
            )
            raise typer.Exit(code=exit_code)

        ui_proc = _spawn_process(ui_cmd, cwd=resolved_web_dir, env=ui_env)

        while True:
            api_rc = api_proc.poll()
            ui_rc = ui_proc.poll()
            if api_rc is not None:
                exit_code = api_rc if api_rc != 0 else (ui_rc or 0)
                if api_rc != 0:
                    console.print(f"[bold red]API exited with code {api_rc}.[/bold red]")
                else:
                    console.print("[yellow]API exited; stopping UI...[/yellow]")
                break
            if ui_rc is not None:
                exit_code = ui_rc if ui_rc != 0 else (api_rc or 0)
                if ui_rc != 0:
                    console.print(f"[bold red]UI exited with code {ui_rc}.[/bold red]")
                else:
                    console.print("[yellow]UI exited; stopping API...[/yellow]")
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        console.print("\n[dim]Stopping webui services...[/dim]")
        exit_code = 130
    finally:
        if ui_proc is not None:
            _stop_process(ui_proc, name="UI")
        if api_proc is not None:
            _stop_process(api_proc, name="API")

    if exit_code != 0:
        raise typer.Exit(code=exit_code)
