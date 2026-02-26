# text Desktop Client

This directory contains the desktop client frontend and Tauri shell.
The desktop build bundles an embedded backend sidecar, so end users do not
need to start a separate API service.

## Requirements

- Node.js 20+
- Rust toolchain (`rustup`, `cargo`)

## Install

```bash
npm install
```

## Frontend Preview in Browser (developer only)

```bash
npm run dev
```

In Tauri runtime, API origin is provided by native IPC (`get_api_origin`) and
points to the embedded backend sidecar. `NEXT_PUBLIC_TEXT_API_ORIGIN` is only
used as a browser/dev fallback.

## Build Desktop Bundle (App-only delivery)

```bash
cd ..
scripts/release/build_desktop_bundle.sh
```

Build output is under `web/src-tauri/target/release/bundle`.
