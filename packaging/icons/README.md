# 平台图标

打包图标集中放在这里，不与构建脚本混放。

| 文件 | 用途 | 当前处理 |
| --- | --- | --- |
| `windows.ico` | Windows EXE 图标 | 已提供，PyInstaller 的 Windows `EXE(icon=...)` 必须使用此文件 |
| `macos.icns` | macOS `.app` 图标 | 待提供；存在时自动传给 `BUNDLE(icon=...)`，否则使用默认图标 |
| `linux.png` | Linux 桌面启动器图标 | 待提供；存在时随 Linux 目录包放到 `_internal/icons/`，桌面启动器安装配置后续接入 |

`windows.ico` 从用户提供的 `scripts/icon-windows.ico` 原样移动，未修改图像内容，包含 16–256 像素的 9 个尺寸。

Linux 建议提供带透明背景的 512×512 或更大 PNG。macOS 建议提供包含多尺寸的 ICNS；如果目前只有 PNG，可先把 1024×1024 原图放为 `macos.png`，之后在 macOS 上转换为 `macos.icns`。当前打包配置不会自动转换这个 PNG，也不要求缺失的平台图标阻塞其他平台构建。
