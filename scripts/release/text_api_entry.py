from __future__ import annotations

import os

import uvicorn
from text.api.app import create_app


def main() -> None:
    host = os.environ.get("TEXT_HOST", "127.0.0.1")
    port = int(os.environ.get("TEXT_PORT", "8000"))
    log_level = os.environ.get("TEXT_API_LOG_LEVEL", "warning")

    uvicorn.run(
        create_app(),
        host=host,
        port=port,
        log_level=log_level,
    )


if __name__ == "__main__":
    main()
