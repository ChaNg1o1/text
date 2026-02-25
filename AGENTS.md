# Repository Guidelines

## Project Structure & Module Organization
- `src/text/`: Python package (CLI, ingest, feature extraction, LLM integration, multi-agent orchestration, report rendering).
- `crates/tf-features/`: Rust PyO3 extension (`text._tf_features`) for high-performance lexical/syntactic/ngram/unicode features.
- `web/`: Next.js frontend (`src/app`, `src/components`, `src/hooks`, `src/lib`, `src/stores`).
- `tests/`: Python test area and fixtures (`tests/fixtures/`).
- `data/`, `sample/`, `output/`, `docs/`: datasets, example inputs/reports, generated outputs, and design notes.

## Build, Test, and Development Commands
- `pip install -e ".[dev]"`: install Python package and dev tooling.
- `pip install -e ".[web]"`: install FastAPI/uvicorn API dependencies.
- `maturin develop`: build and install Rust extension into current Python environment.
- `python -m spacy download en_core_web_sm`: install required NLP model.
- `text analyze full sample/<file> --llm <backend>`: run full CLI analysis.
- `text serve --reload --port 8000`: run API server locally.
- `pytest tests/`: run Python tests.
- `cargo test --workspace`: run Rust tests.
- `ruff check src tests && ruff format --check src tests`: lint/format validation.
- `cd web && npm install && npm run dev`: run frontend; use `npm run lint` and `npm run build` before merge.

## Coding Style & Naming Conventions
- Python: 4-space indentation, Ruff-managed style, max line length `100`.
- Python naming: `snake_case` for functions/modules, `PascalCase` for classes/Pydantic models, explicit type hints for public APIs.
- TypeScript/React: component exports in `PascalCase`; hooks start with `use` (e.g., `use-analysis.ts`).
- Rust: Edition 2021 defaults; modules/functions in `snake_case`.

## Testing Guidelines
- Prefer `pytest` + `pytest-asyncio` for backend and async flows.
- Name tests as `tests/test_<feature>.py`.
- Keep sample payloads and golden data under `tests/fixtures/`.
- Add regression tests for ingest parsing, feature extraction fallbacks, API route behavior, and agent orchestration errors.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history, e.g., `refactor: normalize CLI with grouped subcommands`.
- Keep commits focused and atomic; include code + tests together.
- PRs should include: purpose, key changes, validation commands run, and linked issue/task.
- For UI changes, attach screenshots or short recordings.
- Do not commit secrets (`backends.json`, API keys, `.env`); use `backends.example.json` + environment variables.
