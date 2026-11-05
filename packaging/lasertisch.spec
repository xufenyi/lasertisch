# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import sys
from PyInstaller.utils.hooks import collect_submodules


project_root = Path(SPECPATH).resolve().parent
frontend_dist = project_root / "frontend" / "web-dist"
font_assets = project_root / "backend" / "src" / "lasertisch" / "assets" / "fonts"
icon_root = project_root / "packaging" / "icons"
windows_icon = icon_root / "windows.ico"
macos_icon = icon_root / "macos.icns"
linux_icon = icon_root / "linux.png"
if not (frontend_dist / "index.html").is_file():
    raise SystemExit("frontend/web-dist is missing; run npm run build first")
if not (font_assets / "NotoSansCJKsc-Regular.otf").is_file():
    raise SystemExit("Bundled default font is missing")

platform_excludes = []
hidden_imports = []
extra_binaries = []
extra_datas = []
if sys.platform == "win32":
    if not windows_icon.is_file():
        raise SystemExit("Windows icon is missing: packaging/icons/windows.ico")
    platform_excludes = ["PyQt5", "PyQt6", "PySide2", "PySide6", "cefpython3"]
    hidden_imports = ["clr"]
    conda_bin = Path(sys.executable).resolve().parent / "Library" / "bin"
    for conda_dll in ("ffi.dll", "libcrypto-3-x64.dll", "libssl-3-x64.dll"):
        source = conda_bin / conda_dll
        if source.is_file():
            extra_binaries.append((str(source), "."))
elif sys.platform != "darwin" and linux_icon.is_file():
    extra_datas.append((str(linux_icon), "icons"))

hidden_imports.extend(collect_submodules("fontTools.ttLib.tables"))

analysis = Analysis(
    [str(project_root / "backend" / "scripts" / "run_desktop.py")],
    pathex=[
        str(project_root / "backend" / "src"),
    ],
    binaries=extra_binaries,
    datas=[(str(frontend_dist), "web"), (str(font_assets), "lasertisch/assets/fonts"), *extra_datas],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=platform_excludes,
    noarchive=False,
    optimize=0,
)
pyz = PYZ(analysis.pure)

if sys.platform == "win32":
    executable = EXE(
        pyz,
        analysis.scripts,
        analysis.binaries,
        analysis.datas,
        [],
        name="LaserTisch",
        icon=str(windows_icon),
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
    )
elif sys.platform == "darwin":
    executable = EXE(
        pyz,
        analysis.scripts,
        analysis.binaries,
        analysis.datas,
        [],
        name="LaserTisch",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
    )
    app = BUNDLE(
        executable,
        name="LaserTisch.app",
        icon=str(macos_icon) if macos_icon.is_file() else None,
        bundle_identifier="local.lasertisch.app",
    )
else:
    executable = EXE(
        pyz,
        analysis.scripts,
        [],
        exclude_binaries=True,
        name="LaserTisch",
        debug=False,
        bootloader_ignore_signals=False,
        strip=False,
        upx=True,
        console=False,
        disable_windowed_traceback=False,
    )
    bundle = COLLECT(
        executable,
        analysis.binaries,
        analysis.datas,
        strip=False,
        upx=True,
        name="LaserTisch",
    )
