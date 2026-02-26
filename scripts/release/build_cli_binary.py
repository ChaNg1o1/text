from __future__ import annotations

import platform
import subprocess
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
ENTRY_FILE = ROOT_DIR / "scripts" / "release" / "text_cli_entry.py"
DIST_DIR = ROOT_DIR / "dist" / "cli"
WORK_DIR = ROOT_DIR / "build" / "pyinstaller" / "work"
SPEC_DIR = ROOT_DIR / "build" / "pyinstaller" / "spec"


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=cwd)


def main() -> None:
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    SPEC_DIR.mkdir(parents=True, exist_ok=True)

    pip_check = subprocess.run([sys.executable, "-m", "pip", "--version"], cwd=ROOT_DIR)
    if pip_check.returncode != 0:
        run([sys.executable, "-m", "ensurepip", "--upgrade"])

    run([sys.executable, "-m", "pip", "install", "--upgrade", "pyinstaller"])

    run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--onefile",
            "--name",
            "text",
            "--collect-data",
            "litellm",
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

    binary_name = "text.exe" if platform.system() == "Windows" else "text"
    binary_path = DIST_DIR / binary_name
    print()
    print(f"Built CLI binary: {binary_path}")


if __name__ == "__main__":
    main()
