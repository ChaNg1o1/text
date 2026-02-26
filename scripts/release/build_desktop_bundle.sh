#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR/web"
npm ci

case "$(uname -s)" in
  Darwin)
    npm run tauri -- build --bundles app
    ;;
  Linux)
    npm run tauri -- build --bundles appimage
    ;;
  MINGW*|MSYS*|CYGWIN*)
    npm run tauri -- build --bundles nsis
    ;;
  *)
    npm run desktop:build
    ;;
esac

echo
echo "Desktop bundles are available under:"
echo "  $ROOT_DIR/web/src-tauri/target/release/bundle"
