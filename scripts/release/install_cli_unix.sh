#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN_PATH="${1:-$ROOT_DIR/dist/cli/text}"
INSTALL_DIR="${2:-/usr/local/bin}"

if [[ ! -f "$BIN_PATH" ]]; then
  echo "CLI binary not found: $BIN_PATH" >&2
  echo "Build it first: python scripts/release/build_cli_binary.py" >&2
  exit 1
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "Install dir does not exist: $INSTALL_DIR" >&2
  exit 1
fi

if [[ -w "$INSTALL_DIR" ]]; then
  install -m 755 "$BIN_PATH" "$INSTALL_DIR/text"
else
  sudo install -m 755 "$BIN_PATH" "$INSTALL_DIR/text"
fi

echo "Installed text CLI: $INSTALL_DIR/text"
"$INSTALL_DIR/text" --help >/dev/null && echo "Verified: $INSTALL_DIR/text is executable"
