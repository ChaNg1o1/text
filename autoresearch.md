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
- User preference: stop the experiment loop when further gains are not meaningfully different
- Practical stop rule: if a change improves less than ~3% and less than 0.15ms, treat it as negligible unless it also meaningfully simplifies code

## What's Been Tried
- Added a dedicated ignored Rust benchmark test (`perf_batch_extract_benchmark`) that exercises `extract_features` over a deterministic mixed-language corpus and reports median / best / p90 runtime.
- Initial setup uses Cargo test in release mode as the benchmark driver so correctness checks can remain separate from the timed metric.
- Baseline environment issue: Cargo initially picked unsupported system Python 3.14 for PyO3 build scripts; benchmark scripts now pin `PYO3_PYTHON` to the project Python 3.11 interpreter.
- Replaced per-call function-word lookup map construction with inline match helpers in `lexical.rs`; this improved runtime from about `4.26ms` to `3.84ms` on the benchmark corpus.
- Tried a single-pass Unicode metrics refactor to reduce repeated scans; after fixing a compile error, runtime regressed slightly to `3.882ms`, so the idea was discarded.
- Refactored `ngram.rs` so `extract_all_ngrams` reuses a single collected char buffer and a single tokenized word buffer instead of recomputing them separately for bigrams and trigrams; this improved runtime from `3.84ms` to `3.661ms`.
- Specialized hot-path bigram/trigram string construction in `ngram.rs` for both char and word n-grams, replacing generic iterator collection / `join(" ")` in the dominant `n=2/3` case; this improved runtime further from `3.661ms` to `3.357ms`.
- An attempted optimization to reuse lexical tokens for word n-grams regressed badly (`4.839ms`) and was discarded.
- An attempted ASCII in-place lowercasing fast path for token flushing was effectively noise (`3.675ms`) and was discarded.
- Stopping rule for this session: when improvements are smaller than roughly `3%` and `0.15ms`, treat them as negligible and stop rather than chasing micro-wins.
- Likely remaining opportunities are more invasive: reducing token/string allocation inside tokenization and n-gram key construction, or restructuring sentence/token pipelines to avoid duplicate passes over text.
