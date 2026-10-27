"""Run the desktop application directly from a repository checkout."""

from __future__ import annotations

import sys
from pathlib import Path


BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from lasertisch.desktop import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
