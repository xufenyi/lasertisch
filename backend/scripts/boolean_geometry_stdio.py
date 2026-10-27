"""Read one BooleanRequest and write one BooleanResponse, without modifying files."""
from __future__ import annotations

import json
from pathlib import Path
import sys

BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from lasertisch.application import boolean_geometry_payload  # noqa: E402


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    payload = json.load(sys.stdin)
    json.dump(boolean_geometry_payload(payload), sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
