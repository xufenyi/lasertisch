# 平台图标

打包图标集中放在这里，不与构建脚本混放。源文件是 `icon.svg`，适用于各平台的图标文件都由它生成。

| 文件 | 用途 | 当前处理 |
| --- | --- | --- |
| `windows.ico` | Windows EXE 图标 | 已提供，PyInstaller 的 Windows `EXE(icon=...)` 必须使用此文件 |
| `macos.icns` | macOS `.app` 图标 | 已提供；存在时自动传给 `BUNDLE(icon=...)`，否则使用默认图标 |
| `linux.png` | Linux 桌面启动器图标 | 已提供；存在时随 Linux 目录包放到 `_internal/icons/`，桌面启动器安装配置后续接入 |

