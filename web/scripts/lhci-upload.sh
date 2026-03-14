#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

REPORT="./lighthouse-report.json"

if [ ! -f "${REPORT}" ]; then
  echo "ERROR: ${REPORT} not found. Run bench.sh first."
  exit 1
fi

# LHCI expects reports in a directory named .lighthouseci/
mkdir -p .lighthouseci
cp "${REPORT}" .lighthouseci/lhr-$(date +%s).json

echo "=== Uploading to LHCI temporary public storage ==="
npx lhci upload --config=lighthouserc.js 2>&1

echo "=== Done ==="
echo "Open the dashboard URL above to view results."
