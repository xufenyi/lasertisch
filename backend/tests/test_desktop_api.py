from base64 import b64encode
from pathlib import Path
from typing import Any

from lasertisch.desktop.api import DesktopApi
from lasertisch.desktop.app import find_web_entry
import webview


class FakeWindow:
    def __init__(self, *results: object) -> None:
        self.results = list(results)
        self.calls: list[tuple[object, dict[str, object]]] = []

    def create_file_dialog(self, dialog_type: object, **options: object) -> object:
        self.calls.append((dialog_type, options))
        return self.results.pop(0)


def bound_api(*dialog_results: object) -> tuple[DesktopApi, FakeWindow]:
    api = DesktopApi()
    window = FakeWindow(*dialog_results)
    api.bind_window(window)
    return api, window


def test_native_open_reads_utf8_project_and_cancel_is_not_an_error(tmp_path: Path) -> None:
    project = tmp_path / "part.lasertisch.json"
    project.write_text('{"schemaVersion": 1}', encoding="utf-8")
    api, window = bound_api((str(project),), None)

    opened = api.open_project_file()
    cancelled = api.open_project_file()

    assert opened == {
        "status": "ok",
        "filename": "part.lasertisch.json",
        "content": '{"schemaVersion": 1}',
    }
    assert cancelled == {"status": "cancelled"}
    assert [call[0] for call in window.calls] == [
        webview.FileDialog.OPEN,
        webview.FileDialog.OPEN,
    ]


def test_native_project_save_is_atomic_and_adds_json_extension(tmp_path: Path) -> None:
    target = tmp_path / "saved-project"
    api, window = bound_api((str(target),))

    result = api.save_project_file("suggested.lasertisch.json", "project text\n")

    actual = tmp_path / "saved-project.json"
    assert result == {"status": "ok", "filename": actual.name}
    assert actual.read_text(encoding="utf-8") == "project text\n"
    assert not list(tmp_path.glob("*.tmp"))
    assert window.calls[0][0] is webview.FileDialog.SAVE


def test_native_device_save_decodes_base64_and_enforces_format_extension(
    tmp_path: Path,
) -> None:
    target = tmp_path / "program"
    api, window = bound_api((str(target),))

    result = api.save_device_file(
        "program.dbd", b64encode(b"\x43\x49\x00").decode("ascii"), "dbd"
    )

    actual = tmp_path / "program.dbd"
    assert result == {"status": "ok", "filename": actual.name}
    assert actual.read_bytes() == b"\x43\x49\x00"
    assert window.calls[0][0] is webview.FileDialog.SAVE


def test_native_device_save_rejects_unknown_format_or_invalid_base64() -> None:
    api, window = bound_api()

    assert api.save_device_file("x.bin", "QQ==", "bin")["status"] == "error"
    assert api.save_device_file("x.csv", "not base64", "csv")["status"] == "error"
    assert window.calls == []


def test_frontend_entry_can_be_overridden_for_source_and_packaged_runs(
    tmp_path: Path, monkeypatch: Any
) -> None:
    entry = tmp_path / "index.html"
    entry.write_text("<html></html>", encoding="utf-8")
    monkeypatch.setenv("LASERTISCH_WEB_ROOT", str(tmp_path))

    assert find_web_entry() == entry
