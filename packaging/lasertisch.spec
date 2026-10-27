# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path
import sys


project_root = Path(SPECPATH).resolve().parent
frontend_dist = project_root / "frontend" / "web-dist"
if not (frontend_dist / "index.html").is_file():
    raise SystemExit("frontend/web-dist is missing; run npm run build first")

platform_excludes = []
hidden_imports = []
extra_binaries = []
if sys.platform == "win32":
    platform_excludes = ["PyQt5", "PyQt6", "PySide2", "PySide6", "cefpython3"]
    hidden_imports = ["clr"]
    conda_ffi = Path(sys.executable).resolve().parent / "Library" / "bin" / "ffi.dll"
    if conda_ffi.is_file():
        extra_binaries.append((str(conda_ffi), "."))

analysis = Analysis(
    [str(project_root / "backend" / "scripts" / "run_desktop.py")],
    pathex=[
        str(project_root / "backend" / "src"),
    ],
    binaries=extra_binaries,
    datas=[(str(frontend_dist), "web")],
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
        icon=None,
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
