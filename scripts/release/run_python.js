#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const scriptArgs = process.argv.slice(2);
if (scriptArgs.length === 0) {
  console.error("Usage: node run_python.js <script.py> [args...]");
  process.exit(2);
}

const repoRoot = path.resolve(__dirname, "..", "..");
const venvPython = process.platform === "win32"
  ? path.join(repoRoot, ".venv", "Scripts", "python.exe")
  : path.join(repoRoot, ".venv", "bin", "python");
const candidates = process.platform === "win32"
  ? [venvPython, "python", "py", "python3"]
  : [venvPython, "python3", "python"];

function versionOK(cmd) {
  const args = cmd === "py"
    ? ["-3", "-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"]
    : ["-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"];
  const check = spawnSync(cmd, args, { stdio: "ignore" });
  return check.status === 0;
}

function exists(cmd) {
  const checkArgs = cmd === "py" ? ["-3", "--version"] : ["--version"];
  const probe = spawnSync(cmd, checkArgs, { stdio: "ignore" });
  return probe.status === 0;
}

for (const cmd of candidates) {
  if (!exists(cmd)) continue;
  if (!versionOK(cmd)) continue;
  const args = cmd === "py" ? ["-3", ...scriptArgs] : scriptArgs;
  const run = spawnSync(cmd, args, { stdio: "inherit" });
  process.exit(run.status ?? 1);
}

console.error("No Python 3.11+ runtime found. Install Python 3.11+ or create project .venv.");
process.exit(1);
