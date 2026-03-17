#!/bin/bash
set -euo pipefail

export PYO3_PYTHON="/Users/chang1o/Code/text/.venv/bin/python"

cargo test -p tf-features --release --quiet perf_batch_extract_benchmark -- --ignored --nocapture
