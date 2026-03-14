# autoresearch — React Frontend Performance Optimization

Autonomous AI agent loop for continuously improving a React application's performance metrics (Lighthouse score, bundle size, render performance).

## Setup

To set up a new experiment, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `mar14-perf`). The branch `autoresearch/<tag>` must not already exist.
2. **Create the branch**: `git checkout -b autoresearch/<tag>` from current main/master.
3. **Read the codebase**: Understand the project structure first. Read:
   - `package.json` — dependencies and scripts
   - Build config (`vite.config.ts`, `next.config.js`, `webpack.config.js`, etc.)
   - `src/` directory structure — components, hooks, pages, utils
   - Any existing performance budgets or CI checks
4. **Install the benchmark harness** (if not already present):
   ```bash
   npm install --save-dev lighthouse puppeteer serve
   ```
   Create `scripts/bench.sh` (see Benchmark Harness section below).
5. **Initialize results.tsv**: Create `results.tsv` with just the header row.
6. **Establish baseline**: Run the benchmark once without any changes.
7. **Confirm and go**: Confirm setup looks good with the human.

Once you get confirmation, kick off the experimentation.

## Task Definition

```yaml
optimization_target: minimize    # lower Lighthouse perf score delta = better (we track regression)
primary_metric: perf_score       # Lighthouse performance score (0-100, higher is better -> maximize)
secondary_metrics:
  - bundle_size_kb               # total JS bundle size in KB (minimize)
  - lcp_ms                       # Largest Contentful Paint in ms (minimize)
  - tbt_ms                       # Total Blocking Time in ms (minimize)
  - cls                          # Cumulative Layout Shift (minimize)
timeout_seconds: 180             # 3 minutes per experiment (build + serve + audit)
```

**The goal: maximize `perf_score` while not regressing `bundle_size_kb` by more than 5%.**

When two experiments achieve equal `perf_score`, prefer the one with smaller `bundle_size_kb`.

## Benchmark Harness

Create `scripts/bench.sh` during setup. This is the **fixed evaluation** — do NOT modify it after the baseline run.

```bash
#!/usr/bin/env bash
set -euo pipefail

# --- Config (adjust per project) ---
BUILD_CMD="npm run build"
SERVE_CMD="npx serve -s build -l 4173"   # CRA: build/, Vite: dist/, Next: .next/
SERVE_DIR="build"                         # adjust to match your framework
BASE_URL="http://localhost:4173"
AUDIT_URL="${BASE_URL}"                   # or a specific route like ${BASE_URL}/dashboard

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
```

Make it executable: `chmod +x scripts/bench.sh`.

**Framework-specific adjustments:**

| Framework | `BUILD_CMD` | `SERVE_DIR` | `SERVE_CMD` |
|-----------|-------------|-------------|-------------|
| CRA | `npm run build` | `build` | `npx serve -s build -l 4173` |
| Vite | `npm run build` | `dist` | `npx serve -s dist -l 4173` |
| Next.js (static) | `npm run build && npm run export` | `out` | `npx serve out -l 4173` |
| Next.js (SSR) | `npm run build` | `.next` | `npm start -- -p 4173` |

## Experimentation

**What you CAN do:**
- Modify any source file under `src/` — components, hooks, utils, styles
- Modify build config (`vite.config.ts`, `next.config.js`, `webpack.config.js`, `tsconfig.json`)
- Add/remove/restructure imports (code splitting, lazy loading, barrel file elimination)
- Modify `public/index.html` or equivalent (preload hints, resource hints)
- Adjust asset optimization settings (image formats, compression, etc.)

**What you CANNOT do:**
- Modify `scripts/bench.sh` after the baseline run (it is the fixed evaluation harness)
- Add new npm dependencies (you can only use what's already installed, except devDependencies for tooling)
- Remove user-visible features or break functionality
- Modify test files in a way that makes previously passing tests fail
- Disable or weaken TypeScript strictness

**Simplicity criterion**: All else being equal, simpler is better. Deleting dead code that improves bundle size is a great outcome. Adding a complex custom virtualization for a 0.5 point Lighthouse gain is probably not worth it. Prefer platform-native solutions (native lazy loading, CSS containment) over library-heavy approaches.

## Optimization Playbook (ideas to try, roughly ordered by impact)

### High Impact (try first)
1. **Code splitting** — `React.lazy()` + `Suspense` for route-level splitting
2. **Barrel file elimination** — replace `import { X } from './components'` with direct imports
3. **Image optimization** — WebP/AVIF, proper sizing, `loading="lazy"`, `<picture>` element
4. **Tree shaking** — check for side-effect-ful imports blocking tree shaking (`sideEffects` in package.json)
5. **Bundle analysis** — identify large dependencies, replace with lighter alternatives (e.g. date-fns → dayjs, lodash → lodash-es or native)

### Medium Impact
6. **Memoization** — `React.memo()`, `useMemo()`, `useCallback()` for expensive renders (verify with profiling, don't blindly add everywhere)
7. **CSS optimization** — remove unused CSS, use CSS modules or Tailwind purge, avoid CSS-in-JS runtime overhead
8. **Font optimization** — `font-display: swap`, subset fonts, self-host instead of Google Fonts CDN
9. **Preload critical assets** — `<link rel="preload">` for above-the-fold resources
10. **Virtualization** — `react-window` or `react-virtuoso` for long lists (only if lists exist)

### Lower Impact / Incremental
11. **Compression** — ensure gzip/brotli is configured in build output
12. **CSS containment** — `contain: content` on isolated components
13. **Defer non-critical JS** — move analytics, chat widgets to `requestIdleCallback` or dynamic import
14. **Reduce re-renders** — lift state, split contexts, use selectors (zustand) or `useSyncExternalStore`
15. **Build config tuning** — chunk splitting strategy, minification settings, source map config

## Output format

The bench script prints a summary like this:

```
---
perf_score:      78.5
bundle_size_kb:  342.1
lcp_ms:          1820
tbt_ms:          450
cls:             0.0120
```

Extract the key metrics:

```bash
grep "^perf_score:\|^bundle_size_kb:" run.log
```

## Logging results

Log to `results.tsv` (tab-separated, NOT comma-separated).

Header row and 6 columns:

```
commit	perf_score	bundle_kb	lcp_ms	status	description
```

1. git commit hash (short, 7 chars)
2. perf_score (Lighthouse performance, 0-100) — use 0.0 for crashes
3. bundle_kb (total JS bundle size) — use 0.0 for crashes
4. lcp_ms (Largest Contentful Paint in ms) — use 0 for crashes
5. status: `keep`, `discard`, or `crash`
6. short text description of what this experiment tried

Example:

```
commit	perf_score	bundle_kb	lcp_ms	status	description
a1b2c3d	78.5	342.1	1820	keep	baseline
b2c3d4e	82.0	298.3	1540	keep	lazy load route-level components
c3d4e5f	78.0	340.8	1850	discard	add React.memo to all leaf components
d4e5f6g	0.0	0.0	0	crash	broken dynamic import path
e5f6g7h	85.5	265.7	1320	keep	eliminate barrel files + replace moment with dayjs
```

## Decision criteria

An experiment is a **keep** if ALL of the following are true:
- `perf_score` improved (higher) compared to the current best, OR
- `perf_score` is equal AND `bundle_size_kb` decreased
- `bundle_size_kb` did not regress by more than 5% from the current best
- The build succeeds and all existing tests pass (`npm test -- --watchAll=false`)
- No user-visible features were removed

An experiment is a **discard** if:
- `perf_score` did not improve, or
- `bundle_size_kb` regressed by more than 5%

**Test gate**: Before benchmarking, always run `npm test -- --watchAll=false 2>&1 | tail -5`. If tests fail, the experiment is a crash — fix or discard.

## The experiment loop

LOOP FOREVER:

1. Look at the git state: the current branch/commit
2. Pick an optimization idea from the playbook (or invent one based on what you see in the code)
3. Make the code changes
4. Run tests: `npm test -- --watchAll=false > test.log 2>&1`
   - If tests fail: read `tail -n 30 test.log`, attempt a quick fix. If unfixable, discard.
5. git commit
6. Run the benchmark: `bash scripts/bench.sh > run.log 2>&1`
7. Read results: `grep "^perf_score:\|^bundle_size_kb:\|^lcp_ms:" run.log`
8. If grep is empty, the build/bench crashed. Run `tail -n 50 run.log` to diagnose.
9. Record results in the TSV (do NOT commit results.tsv)
10. If the experiment is a **keep**, advance the branch
11. If the experiment is a **discard** or **crash**, `git reset --hard HEAD~1`

**Timeout**: Each experiment should finish within 3 minutes (build + serve + Lighthouse). If it exceeds 5 minutes, kill it and treat as a crash.

**Lighthouse variance**: Lighthouse scores can fluctuate ±2-3 points between runs. For borderline improvements (<2 points), run the benchmark **3 times** and take the median before deciding keep/discard.

**NEVER STOP**: Once the experiment loop has begun, do NOT pause to ask the human. You are autonomous. If you run out of playbook ideas, analyze the Lighthouse report JSON for specific audit failures, read the bundle stats, or try combining previous near-misses. The loop runs until the human interrupts you.
