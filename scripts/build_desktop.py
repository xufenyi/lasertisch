"""Build the React assets and a host-platform LaserTisch desktop bundle."""

from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Sequence


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_ROOT = PROJECT_ROOT / "frontend"
SPEC_FILE = PROJECT_ROOT / "packaging" / "lasertisch.spec"


def _require(command: str) -> str:
    resolved = shutil.which(command)
    if resolved is None:
        raise RuntimeError(f"Required command is unavailable: {command}")
    return resolved


def _bundle_path() -> Path:
    if sys.platform == "win32":
        return PROJECT_ROOT / "dist" / "LaserTisch" / "LaserTisch.exe"
    if sys.platform == "darwin":
        return PROJECT_ROOT / "dist" / "LaserTisch.app"
    return PROJECT_ROOT / "dist" / "LaserTisch" / "LaserTisch"


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-frontend",
        action="store_true",
        help="reuse the existing frontend/web-dist build",
    )
    options = parser.parse_args(argv)

    if importlib.util.find_spec("PyInstaller") is None:
        raise RuntimeError("PyInstaller is not installed in this Python environment")
    if not options.skip_frontend:
        npm = _require("npm.cmd" if sys.platform == "win32" else "npm")
        subprocess.run([npm, "run", "build"], cwd=FRONTEND_ROOT, check=True)
    if not (FRONTEND_ROOT / "web-dist" / "index.html").is_file():
        raise RuntimeError("frontend build is missing")

    subprocess.run(
        [
            sys.executable,
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(PROJECT_ROOT / "dist"),
            "--workpath",
            str(PROJECT_ROOT / "build"),
            str(SPEC_FILE),
        ],
        cwd=PROJECT_ROOT,
        check=True,
    )
    bundle = _bundle_path()
    if not bundle.exists():
        raise RuntimeError(f"desktop bundle was not created: {bundle}")
    print(bundle)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
