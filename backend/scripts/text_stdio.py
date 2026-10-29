"""UTF-8 development transport for font catalogs and outline conversion."""
from __future__ import annotations
import json
from pathlib import Path
import sys

BACKEND_SRC = Path(__file__).resolve().parents[1]/"src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0,str(BACKEND_SRC))

from lasertisch.application import ApplicationApi  # noqa: E402


def main() -> int:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    payload=json.load(sys.stdin)
    api=ApplicationApi()
    response=api.font_catalog(payload) if len(sys.argv)>1 and sys.argv[1]=="fonts" else api.text_outline(payload)
    json.dump(response,sys.stdout,ensure_ascii=False)
    return 0


if __name__=="__main__":
    raise SystemExit(main())
