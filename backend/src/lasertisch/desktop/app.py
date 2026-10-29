"""LaserTisch native desktop entrypoint."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys
from typing import Sequence

from .api import DesktopApi


def _candidate_web_roots() -> list[Path]:
    candidates: list[Path] = []
    override = os.environ.get("LASERTISCH_WEB_ROOT")
    if override:
        candidates.append(Path(override))
    frozen_root = getattr(sys, "_MEIPASS", None)
    if frozen_root:
        candidates.append(Path(frozen_root) / "web")
    module_path = Path(__file__).resolve()
    candidates.extend(
        [
            module_path.parent / "web",
            module_path.parents[4] / "frontend" / "web-dist",
        ]
    )
    return candidates


def find_web_entry() -> Path:
    for root in _candidate_web_roots():
        entry = root.resolve() / "index.html"
        if entry.is_file():
            return entry
    searched = ", ".join(str(path) for path in _candidate_web_roots())
    raise FileNotFoundError(
        f"LaserTisch frontend build was not found. Searched: {searched}"
    )


def create_window(entry: Path | None = None):
    import webview

    api = DesktopApi()
    window = webview.create_window(
        "LaserTisch",
        str(entry or find_web_entry()),
        js_api=api,
        width=1440,
        height=900,
        min_size=(1000, 640),
        resizable=True,
        background_color="#e8eef3",
    )
    api.bind_window(window)
    return window


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Start the LaserTisch desktop app")
    parser.add_argument("--debug", action="store_true", help="enable webview debugging")
    parser.add_argument("--self-test", action="store_true", help=argparse.SUPPRESS)
    options = parser.parse_args(argv)

    if options.self_test:
        from lasertisch.device.protocol import MotionCommand, encode_dbd

        find_web_entry()
        encode_dbd([MotionCommand("jump", 0.0, 0.0, 10_000.0)])
        from lasertisch.domain.text import TextParameters
        from lasertisch.text.outlines import generate_text_outline
        snapshot,_=generate_text_outline(TextParameters(content="B8中文",short_segment_target_um=100))
        from lasertisch.domain.models import TextEntity
        TextEntity(id="00000000-0000-0000-0000-000000000001",name="Text self-test",text=snapshot.source,
                   parts=snapshot.parts,engine_versions=snapshot.engine_versions)
        return 0

    import webview

    webview.settings["ALLOW_DOWNLOADS"] = False
    create_window()
    webview.start(debug=options.debug, http_server=True, private_mode=True)
    return 0
