"""Read installed vector fonts; expose identities, never machine-specific paths."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import RLock

from fontTools.ttLib import TTCollection, TTFont, TTLibError

from lasertisch.domain.text import FontReference
from .errors import TextGeometryError
from .diagnostics import install_font_metadata_filters

install_font_metadata_filters()

FONT_ASSETS = Path(__file__).resolve().parents[1] / "assets" / "fonts"
FONT_SUFFIXES = {".ttf", ".otf", ".ttc", ".otc"}


@dataclass(frozen=True)
class FontRecord:
    path: Path
    descriptor: FontReference


def _name(font: TTFont, ids: tuple[int, ...], fallback: str) -> str:
    table = font["name"]
    for name_id in ids:
        records = sorted((item for item in table.names if item.nameID == name_id),
                         key=lambda item: (item.langID != 0x409, item.platformID != 3))
        for item in records:
            try:
                text = item.toUnicode().strip()
            except (UnicodeError, LookupError):
                continue
            if text:
                return text
    return fallback


@lru_cache(maxsize=1024)
def _inspect(path: str, size: int, modified: int, bundled: bool) -> tuple[FontRecord, ...]:
    font_path = Path(path)
    with font_path.open("rb") as stream:
        fingerprint = hashlib.file_digest(stream, "sha256").hexdigest()
    if font_path.suffix.lower() in {".ttc", ".otc"}:
        collection = TTCollection(path, lazy=True)
        count = len(collection.fonts)
        collection.close()
    else:
        count = 1
    if count > 256:
        raise TextGeometryError("font.unsupported")
    result = []
    for index in range(count):
        with TTFont(path, fontNumber=index, lazy=True) as font:
            if not any(table in font for table in ("glyf", "CFF ", "CFF2")) or any(table in font for table in ("COLR", "CBDT", "sbix", "SVG ")):
                continue
            family = _name(font, (16, 1), font_path.stem)[:200]
            style = _name(font, (17, 2), "Regular")[:200]
            descriptor = FontReference(
                id=f"{fingerprint}:{index}", fingerprint=fingerprint, face_index=index,
                family=family, style=style, full_name=_name(font, (4,), f"{family} {style}")[:300],
                postscript_name=_name(font, (6,), f"{family}-{style}")[:300],
                units_per_em=font["head"].unitsPerEm, bundled=bundled,
            )
            result.append(FontRecord(font_path, descriptor))
    return tuple(result)


def _directory_fonts(directory: Path):
    if directory.is_dir():
        try:
            yield from (path for path in directory.rglob("*") if path.suffix.lower() in FONT_SUFFIXES and path.is_file())
        except OSError:
            return


def installed_font_paths() -> list[Path]:
    paths: list[Path] = []
    if sys.platform == "win32":
        import winreg
        system = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
        directories = [system, Path(os.environ.get("LOCALAPPDATA", str(Path.home()/"AppData/Local"))) / "Microsoft/Windows/Fonts"]
        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(hive, r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts") as key:
                    for index in range(winreg.QueryInfoKey(key)[1]):
                        _, value, _ = winreg.EnumValue(key, index)
                        if isinstance(value, str):
                            path = Path(os.path.expandvars(value))
                            paths.append(path if path.is_absolute() else system / path)
            except OSError:
                pass
    elif sys.platform == "darwin":
        directories = [Path("/System/Library/Fonts"), Path("/Library/Fonts"), Path.home()/"Library/Fonts"]
    else:
        directories = [Path("/usr/share/fonts"), Path("/usr/local/share/fonts"), Path.home()/".local/share/fonts", Path.home()/".fonts"]
        try:
            completed = subprocess.run(["fc-list", "--format=%{file}\n"], capture_output=True,
                text=True, encoding="utf-8", errors="replace", timeout=15, check=True)
            paths.extend(Path(line) for line in completed.stdout.splitlines() if line)
        except (OSError, subprocess.SubprocessError):
            pass
    for directory in directories:
        paths.extend(_directory_fonts(directory))
    unique = {}
    for path in paths:
        try:
            if path.suffix.lower() in FONT_SUFFIXES and path.is_file():
                resolved = path.resolve()
                unique[os.path.normcase(str(resolved))] = resolved
        except OSError:
            continue
    return sorted(unique.values(), key=lambda path: str(path).casefold())


class FontRepository:
    def __init__(self):
        self._records: dict[str, FontRecord] = {}
        self._default_id: str | None = None
        self._system_loaded = False
        self._skipped = 0
        self._lock = RLock()

    def default_record(self) -> FontRecord:
        with self._lock:
            try:
                manifest = json.loads((FONT_ASSETS/"manifest.json").read_text(encoding="utf-8"))
                path = FONT_ASSETS / "NotoSansCJKsc-Regular.otf"
                stat = path.stat()
                records = _inspect(str(path), stat.st_size, stat.st_mtime_ns, True)
                record = records[0]
                if record.descriptor.fingerprint != manifest["sha256"]:
                    raise TextGeometryError("font.default_changed")
            except (OSError, ValueError, KeyError, IndexError, TTLibError) as error:
                if isinstance(error, TextGeometryError):
                    raise
                raise TextGeometryError("font.default_unavailable") from error
            self._default_id = record.descriptor.id
            self._records[self._default_id] = record
            return record

    def list_fonts(self, include_system=True, refresh=False) -> tuple[str, list[FontReference], int]:
        with self._lock:
            default = self.default_record()
            if include_system and (refresh or not self._system_loaded):
                self._records = {default.descriptor.id: default}
                self._skipped = 0
                for path in installed_font_paths():
                    try:
                        stat = path.stat()
                        records = _inspect(str(path), stat.st_size, stat.st_mtime_ns, False)
                        if not records:
                            self._skipped += 1
                        for record in records:
                            self._records.setdefault(record.descriptor.id, record)
                    except (OSError, ValueError, KeyError, TTLibError, IndexError):
                        self._skipped += 1
                self._system_loaded = True
            descriptors = [record.descriptor for record in self._records.values()] if include_system else [default.descriptor]
            descriptors.sort(key=lambda item: (not item.bundled, item.family.casefold(), item.style.casefold(), item.id))
            return default.descriptor.id, descriptors, self._skipped if include_system else 0

    def resolve(self, font_id: str | None) -> FontRecord:
        with self._lock:
            default = self.default_record()
            if font_id is None or font_id == default.descriptor.id:
                return default
            if font_id not in self._records:
                self.list_fonts(include_system=True)
            record = self._records.get(font_id)
            if record is None:
                raise TextGeometryError("font.unavailable")
            return record


FONT_REPOSITORY = FontRepository()
