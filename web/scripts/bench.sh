#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# --- Config (Next.js static export) ---
BUILD_CMD="npm run build"
SERVE_DIR="out"
SERVE_CMD="npx serve ${SERVE_DIR} -l 4173"
BASE_URL="http://localhost:4173"
AUDIT_URL="${BASE_URL}"

# --- Build ---
echo "=== Building ==="
${BUILD_CMD} 2>&1

# --- Bundle size ---
BUNDLE_KB=$(find "${SERVE_DIR}" -name '*.js' -exec cat {} + | wc -c | awk '{printf "%.1f", $1/1024}')
echo "bundle_size_kb: ${BUNDLE_KB}"

# --- Lighthouse audit ---
echo "=== Starting server ==="
${SERVE_CMD} &
SERVER_PID=$!
sleep 3

echo "=== Running Lighthouse ==="
npx lighthouse "${AUDIT_URL}" \
  --output=json \
  --output-path=./lighthouse-report.json \
  --chrome-flags="--headless --no-sandbox --disable-gpu" \
  --only-categories=performance \
  --quiet

kill ${SERVER_PID} 2>/dev/null || true

# --- Extract metrics ---
PERF=$(node -e "const r=require('./lighthouse-report.json'); console.log((r.categories.performance.score*100).toFixed(1))")
LCP=$(node -e "const r=require('./lighthouse-report.json'); const a=r.audits['largest-contentful-paint']; console.log(a.numericValue.toFixed(0))")
TBT=$(node -e "const r=require('./lighthouse-report.json'); const a=r.audits['total-blocking-time']; console.log(a.numericValue.toFixed(0))")
CLS=$(node -e "const r=require('./lighthouse-report.json'); const a=r.audits['cumulative-layout-shift']; console.log(a.numericValue.toFixed(4))")

echo "---"
echo "perf_score:      ${PERF}"
echo "bundle_size_kb:  ${BUNDLE_KB}"
echo "lcp_ms:          ${LCP}"
echo "tbt_ms:          ${TBT}"
echo "cls:             ${CLS}"
