#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

cd "$ROOT_DIR/web"
npm ci

# --- Code signing (optional, controlled via environment variables) ---

case "$(uname -s)" in
  Darwin)
    # macOS code signing + notarization
    if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
      export APPLE_SIGNING_IDENTITY
      echo "macOS code signing enabled (identity: $APPLE_SIGNING_IDENTITY)"

      if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
        export APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
        echo "macOS notarization enabled"
        npm run tauri -- build --bundles app,dmg
      else
        echo "Notarization skipped (APPLE_ID / APPLE_PASSWORD / APPLE_TEAM_ID not set)"
        npm run tauri -- build --bundles app
      fi
    else
      echo "macOS code signing skipped (APPLE_SIGNING_IDENTITY not set)"
      npm run tauri -- build --bundles app
    fi
    ;;
  Linux)
    # GitHub-hosted Linux runners can fail to execute linuxdeploy's AppImage
    # runtime directly; extract-and-run avoids the FUSE-dependent path.
    export APPIMAGE_EXTRACT_AND_RUN=1
    echo "Linux AppImage bundling enabled with APPIMAGE_EXTRACT_AND_RUN=1"
    npm run tauri -- build --bundles appimage
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Windows update signing
    if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
      export TAURI_SIGNING_PRIVATE_KEY
      echo "Windows update signing enabled"
    fi
    npm run tauri -- build --bundles nsis
    ;;
  *)
    npm run desktop:build
    ;;
esac

echo
echo "Desktop bundles are available under:"
echo "  $ROOT_DIR/web/src-tauri/target/release/bundle"
