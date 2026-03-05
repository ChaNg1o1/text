from __future__ import annotations

import os

import uvicorn
from text.api.app import create_app


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    return value not in {"", "0", "false", "off", "no"}


def main() -> None:
    host = os.environ.get("TEXT_HOST", "127.0.0.1")
    port = int(os.environ.get("TEXT_PORT", "8000"))
    log_level = os.environ.get("TEXT_API_LOG_LEVEL", "warning")
    access_log = _env_bool("TEXT_API_ACCESS_LOG", True)

    uvicorn.run(
        create_app(),
        host=host,
        port=port,
        log_level=log_level,
        access_log=access_log,
    )


if __name__ == "__main__":
    main()
