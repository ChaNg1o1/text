#!/bin/bash
set -euo pipefail

export PYO3_PYTHON="/Users/chang1o/Code/text/.venv/bin/python"

cargo test --workspace --quiet 2>&1 | tail -80
