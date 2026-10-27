"""Read one ExportRequest JSON value from stdin and write one ExportResponse."""

from __future__ import annotations

import json
import sys
from pathlib import Path


BACKEND_SRC = Path(__file__).resolve().parents[1] / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from lasertisch.application import export_device_program_payload  # noqa: E402


def main() -> int:
    payload = json.load(sys.stdin)
    json.dump(export_device_program_payload(payload), sys.stdout, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
