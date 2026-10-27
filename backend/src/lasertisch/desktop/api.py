"""pywebview API extensions for native project and device-file dialogs."""

from __future__ import annotations

from base64 import b64decode
from binascii import Error as Base64Error
import os
from pathlib import Path
import re
from threading import RLock
from typing import Any
from uuid import uuid4

import webview

from lasertisch.application import ApplicationApi


MAX_PROJECT_BYTES = 20 * 1024 * 1024
MAX_DEVICE_BYTES = 100 * 1024 * 1024
PROJECT_FILE_TYPES = ("LaserTisch project (*.lasertisch.json;*.json)",)
DEVICE_FILE_TYPES = {
    "csv": ("CSV motion program (*.csv)",),
    "dbd": ("DBD device program (*.dbd)",),
}
_UNSAFE_FILENAME = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def _safe_suggested_filename(value: object, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    name = _UNSAFE_FILENAME.sub("_", value.strip())[:240]
    return name or fallback


def _selected_path(value: object) -> Path | None:
    if value is None:
        return None
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, (tuple, list)) and value and isinstance(value[0], str):
        return Path(value[0])
    return None


def _with_required_extension(path: Path, extension: str) -> Path:
    return path if path.name.lower().endswith(extension) else path.with_name(
        f"{path.name}{extension}"
    )


def _atomic_write(path: Path, content: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
    try:
        temporary.write_bytes(content)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class DesktopApi(ApplicationApi):
    """Application API plus native dialogs; a window is bound after creation."""

    def __init__(self) -> None:
        self._window: Any | None = None
        self._dialog_lock = RLock()

    def bind_window(self, window: Any) -> None:
        self._window = window

    def _require_window(self) -> Any:
        if self._window is None:
            raise RuntimeError("desktop window is not ready")
        return self._window

    def open_project_file(self) -> dict[str, object]:
        try:
            with self._dialog_lock:
                selection = self._require_window().create_file_dialog(
                    webview.OPEN_DIALOG,
                    allow_multiple=False,
                    file_types=PROJECT_FILE_TYPES,
                )
            path = _selected_path(selection)
            if path is None:
                return {"status": "cancelled"}
            if path.stat().st_size > MAX_PROJECT_BYTES:
                return {"status": "error", "code": "file.project_too_large"}
            return {
                "status": "ok",
                "filename": path.name,
                "content": path.read_text(encoding="utf-8-sig"),
            }
        except (OSError, UnicodeError, RuntimeError):
            return {"status": "error", "code": "file.open_failed"}

    def save_project_file(
        self, suggested_filename: object, content: object
    ) -> dict[str, object]:
        if not isinstance(content, str):
            return {"status": "error", "code": "file.invalid_content"}
        encoded = content.encode("utf-8")
        if len(encoded) > MAX_PROJECT_BYTES:
            return {"status": "error", "code": "file.project_too_large"}
        suggested = _safe_suggested_filename(
            suggested_filename, "LaserTisch.lasertisch.json"
        )
        try:
            with self._dialog_lock:
                selection = self._require_window().create_file_dialog(
                    webview.SAVE_DIALOG,
                    save_filename=suggested,
                    file_types=PROJECT_FILE_TYPES,
                )
            path = _selected_path(selection)
            if path is None:
                return {"status": "cancelled"}
            path = _with_required_extension(path, ".json")
            _atomic_write(path, encoded)
            return {"status": "ok", "filename": path.name}
        except (OSError, RuntimeError):
            return {"status": "error", "code": "file.save_failed"}

    def save_device_file(
        self,
        suggested_filename: object,
        content_base64: object,
        export_format: object,
    ) -> dict[str, object]:
        if export_format not in DEVICE_FILE_TYPES or not isinstance(content_base64, str):
            return {"status": "error", "code": "file.invalid_content"}
        if len(content_base64) > (MAX_DEVICE_BYTES * 4 // 3) + 4:
            return {"status": "error", "code": "file.device_program_too_large"}
        try:
            content = b64decode(content_base64, validate=True)
        except (Base64Error, ValueError):
            return {"status": "error", "code": "file.invalid_content"}
        if len(content) > MAX_DEVICE_BYTES:
            return {"status": "error", "code": "file.device_program_too_large"}
        extension = f".{export_format}"
        suggested = _safe_suggested_filename(
            suggested_filename, f"LaserTisch{extension}"
        )
        try:
            with self._dialog_lock:
                selection = self._require_window().create_file_dialog(
                    webview.SAVE_DIALOG,
                    save_filename=suggested,
                    file_types=DEVICE_FILE_TYPES[export_format],
                )
            path = _selected_path(selection)
            if path is None:
                return {"status": "cancelled"}
            path = _with_required_extension(path, extension)
            _atomic_write(path, content)
            return {"status": "ok", "filename": path.name}
        except (OSError, RuntimeError):
            return {"status": "error", "code": "file.save_failed"}
