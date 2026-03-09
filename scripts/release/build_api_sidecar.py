from __future__ import annotations

import os
import platform
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
ENTRY_FILE = ROOT_DIR / "scripts" / "release" / "text_api_entry.py"
DIST_DIR = ROOT_DIR / "web" / "src-tauri" / "bin"
WORK_DIR = ROOT_DIR / "build" / "pyinstaller" / "work-api"
SPEC_DIR = ROOT_DIR / "build" / "pyinstaller" / "spec-api"


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=cwd)


def main() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    SPEC_DIR.mkdir(parents=True, exist_ok=True)

    run([sys.executable, "-m", "pip", "install", "-e", ".[desktop]"], cwd=ROOT_DIR)
    run([sys.executable, "-m", "pip", "install", "--upgrade", "pyinstaller"])

    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onedir",
            "--name",
            "text-api",
            "--collect-data",
            "litellm",
            "--collect-data",
            "spacy",
            "--collect-submodules",
            "text",
            "--hidden-import",
            "uvicorn.loops.auto",
            "--hidden-import",
            "uvicorn.protocols.http.auto",
            "--hidden-import",
            "uvicorn.lifespan.on",
            "--exclude-module",
            "tkinter",
            "--exclude-module",
            "test",
            "--exclude-module",
            "unittest",
            "--exclude-module",
            "setuptools",
            "--exclude-module",
            "pip",
            "--paths",
            str(ROOT_DIR / "src"),
            "--distpath",
            str(DIST_DIR),
            "--workpath",
            str(WORK_DIR),
            "--specpath",
            str(SPEC_DIR),
            str(ENTRY_FILE),
        ],
        cwd=ROOT_DIR,
    )

    binary_name = "text-api.exe" if platform.system() == "Windows" else "text-api"
    binary_path = DIST_DIR / "text-api" / binary_name

    if platform.system() != "Windows":
        os.chmod(binary_path, 0o755)

    print()
    print(f"Built desktop backend sidecar: {binary_path}")


if __name__ == "__main__":
    main()
