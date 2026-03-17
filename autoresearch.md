# Autoresearch: rust tf-features assembly-level optimization

## Objective
Optimize the Rust feature extraction extension in `crates/tf-features` at a low level, focusing on hot-path CPU and allocation behavior in tokenization, lexical metrics, n-gram extraction, sentence metrics, and Unicode analysis.

The target workload is the Rust-side batch extraction path over a fixed mixed-language corpus (English, Chinese, mixed-script, emoji, punctuation-heavy text) executed in parallel with Rayon. The benchmark measures only extraction runtime inside Rust, not Cargo compile time.

## Metrics
- **Primary**: total_ms (ms, lower is better)
- **Secondary**: best_ms, p90_ms, texts, total_chars, checksum

## How to Run
`./autoresearch.sh` — runs the ignored Rust benchmark test and emits `METRIC name=value` lines.

## Files in Scope
- `crates/tf-features/src/lib.rs` — top-level extraction orchestration and test module wiring
- `crates/tf-features/src/lexical.rs` — tokenization, lexical richness, function words, MTLD, HD-D
- `crates/tf-features/src/ngram.rs` — char / word n-gram extraction and truncation
- `crates/tf-features/src/syntactic.rs` — sentence splitting and sentence-length stats
- `crates/tf-features/src/unicode.rs` — Unicode heuristics, punctuation, code-switching, formality
- `crates/tf-features/src/perf_bench.rs` — deterministic ignored benchmark for autoresearch
- `autoresearch.sh` — benchmark entrypoint
- `autoresearch.checks.sh` — correctness checks

## Off Limits
- Python feature extraction logic in `src/text/**`
- Web frontend in `web/**`
- Public Python API / schema changes unless absolutely necessary for a clear primary-metric win
- Dependency additions unless they are tiny and clearly justified

## Constraints
- Preserve benchmark checksum semantics for the workload
- Keep Rust unit tests passing
- Keep the current feature surface intact for Python callers
- Prefer simpler, allocation-reducing, branch-reducing changes over invasive redesigns
- Optimize measured Rust execution time, not build time

## What's Been Tried
- Added a dedicated ignored Rust benchmark test (`perf_batch_extract_benchmark`) that exercises `extract_features` over a deterministic mixed-language corpus and reports median / best / p90 runtime.
- Initial setup uses Cargo test in release mode as the benchmark driver so correctness checks can remain separate from the timed metric.
- Baseline environment issue: Cargo initially picked unsupported system Python 3.14 for PyO3 build scripts; benchmark scripts now pin `PYO3_PYTHON` to the project Python 3.11 interpreter.
- Suspected hot paths before experimentation: repeated construction of function-word lookup tables, repeated tokenization across subsystems, Unicode multi-pass scans, and n-gram string allocation.
