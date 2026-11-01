# 开发者入口

[返回项目首页](../README.md) · [使用指南](user-guide.md)

本文是维护者和 AI 助手的起点：先完成环境配置，再选择浏览器或桌面运行方式。修改实现前，继续阅读[架构](architecture.md)、[文字管线](text-pipeline.md)、[开发协作](development.md)和[测试与验收](testing.md)。

快速跳转：[环境要求](#环境要求) · [配置环境](#配置环境) · [浏览器运行](#浏览器运行) · [桌面运行](#桌面运行) · [打包](#打包) · [排查](#验证与排查)

## 环境要求

| 项目 | 要求与来源 |
| --- | --- |
| Python | **3.12**，范围由 [pyproject.toml](../backend/pyproject.toml) 限定 |
| Node.js / npm | 已验证 Node.js 24、npm 11；前端依赖以 [package-lock.json](../frontend/package-lock.json) 为准，使用 `npm ci` |
| Python 环境 | 在仓库根目录创建 `.venv`，所有 Python 命令均使用其中的解释器 |
| 桌面运行库 | Windows 使用 WebView2；Linux 示例使用 GTK/WebKit；macOS 使用 Cocoa/WebKit |

Python 依赖声明兼容范围和部分固定版本，并非完整锁文件。排查版本问题时记录实际安装版本。

以下命令均从仓库根目录开始。已有环境可直接使用，不必重复创建。Node.js 和 npm 请预先安装并加入 PATH。

## 配置环境

### Windows：标准 Python 虚拟环境

在 PowerShell 执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
npm.cmd --prefix .\frontend ci
```

`python` 必须指向 Python 3.12。标准 venv 的解释器位于 `.venv\Scripts\python.exe`。

### Windows：Anaconda 目录环境

也可选择 Conda，无需同时创建标准 venv：

```powershell
conda create -p .\.venv python=3.12 -y
.\.venv\python.exe -m pip install -e ".\backend[dev]"
npm.cmd --prefix .\frontend ci
```

Conda 环境的解释器位于 `.venv\python.exe`。当前 Windows 工作副本使用这一布局；后文 Windows 命令以此为例，标准 venv 用户改为 `.venv\Scripts\python.exe`。

桌面运行还需安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2)。浏览器开发模式使用本机浏览器。

### Linux：Ubuntu 24.04 / GTK 示例

此示例使用系统的 Python 3.12 与 GTK 绑定，并通过 `--system-site-packages` 让虚拟环境读取发行版提供的 `gi`。项目 Python 依赖仍安装在 `.venv` 中。

```bash
sudo apt update
sudo apt install python3.12 python3.12-venv python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1 fontconfig
python3.12 -m venv --system-site-packages .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e './backend[dev]'
npm --prefix frontend ci
```

桌面模式需要图形会话。其他发行版的 Python 版本、包名和 WebKit 依赖可能不同，按 [pywebview 安装说明](https://pywebview.flowrl.com/guide/installation.html)配置；不要将不匹配的系统 `gi` 复制进虚拟环境。Linux 配置尚待实机验证。

### macOS

先安装 Python 3.12、Node.js/npm 和 Xcode Command Line Tools，然后执行：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e './backend[dev]'
npm --prefix frontend ci
```

pywebview 使用 Cocoa/WebKit，Python 平台依赖由 pip 安装。遇到 PyObjC 问题时参阅 [pywebview 安装说明](https://pywebview.flowrl.com/guide/installation.html)。macOS 配置尚待实机验证。

## 浏览器运行

Windows：

```powershell
npm.cmd --prefix .\frontend run dev
```

Linux / macOS：

```bash
npm --prefix frontend run dev
```

在浏览器中打开终端输出的本机地址。保持开发服务器运行，结束时按 Ctrl+C。

Vite 将规划、导出、布尔和文字请求转交给本地 Python 子进程，不需要另开后端服务。前端热更新，Python 修改在下一次请求时载入。浏览器通过文件选择和下载操作项目文件，桌面模式使用原生文件对话框。

默认自动发现仓库中的 `.venv`。使用其他虚拟环境时，在启动 Vite **之前**设置解释器绝对路径：

```powershell
$env:LASERTISCH_PYTHON = (Resolve-Path .\.venv\python.exe).Path
npm.cmd --prefix .\frontend run dev
```

```bash
export LASERTISCH_PYTHON="$PWD/.venv/bin/python"
npm --prefix frontend run dev
```

Python 桥接仅接在 Vite 开发服务器上；直接打开静态 `index.html` 不能代替完整运行方式。

## 桌面运行

先构建静态前端，再启动源码版桌面应用。

Windows：

```powershell
npm.cmd --prefix .\frontend run build
.\.venv\python.exe .\backend\scripts\run_desktop.py --debug
```

Linux / macOS：

```bash
npm --prefix frontend run build
.venv/bin/python backend/scripts/run_desktop.py --debug
```

`--debug` 启用 WebView 调试功能，普通启动可省略。桌面模式读取 `frontend/web-dist/`，前端修改后须重新构建并重启。`LASERTISCH_WEB_ROOT` 可指定另一个包含 `index.html` 的前端目录，常规开发无需设置。

无需打开窗口的自检：

```powershell
.\.venv\python.exe .\backend\scripts\run_desktop.py --self-test
```

Linux / macOS 将解释器改为 `.venv/bin/python`。自检检查前端资源、默认字体轮廓及设备编码，不替代交互验收。

## 打包

在目标操作系统及目标架构环境中构建，不能用 Windows 构建 Linux 或 macOS 发行包。该限制见 [PyInstaller 官方说明](https://pyinstaller.org/en/stable/operating-mode.html)。

Windows：

```powershell
.\.venv\python.exe .\scripts\build_desktop.py
```

Linux / macOS：

```bash
.venv/bin/python scripts/build_desktop.py
```

脚本依次执行前端类型检查与构建、PyInstaller 打包和发行包 `--self-test`。如果已有匹配当前源码的前端构建，可加 `--skip-frontend`。

| 平台 | 产物 | 分发内容 | 验证情况 |
| --- | --- | --- | --- |
| Windows | `dist/LaserTisch.exe` | 单个 EXE，目标电脑需 WebView2 | 已验证 |
| Linux | `dist/LaserTisch/LaserTisch` | 整个 `dist/LaserTisch/` 目录；目标机需相应桌面运行库 | 待实机验证 |
| macOS | `dist/LaserTisch.app` | 整个 `.app`；当前脚本未提供签名或公证流程 | 待实机验证 |

配置在 [packaging/lasertisch.spec](../packaging/lasertisch.spec)。默认字体、版权、OFL 许可和前端资源随包分发；FontTools 动态字体表模块需一并收集。

图标位于 [packaging/icons/](../packaging/icons/README.md)：Windows 必须提供 `windows.ico`；macOS 可提供 `macos.icns`；Linux 可提供 `linux.png`。当前只有 Windows 图标，Linux 桌面启动器安装尚未实现。

## 验证与排查

- 测试命令和按功能验收清单见[测试与验收](testing.md)。
- 提示找不到前端：运行 `npm --prefix frontend run build`，检查 `frontend/web-dist/index.html`。
- 浏览器中的 Python 请求失败：检查虚拟环境和依赖，以及 `LASERTISCH_PYTHON` 是否指向正确解释器。
- Windows 构建不能覆盖 EXE：先关闭发行程序，再检查文件权限后重试。
- 系统字体在启动时静默扫描，只在文字编辑面板显示等待状态；已知可恢复的字体元数据诊断定向静默，其他错误仍保留，见[文字管线](text-pipeline.md)。

## 继续阅读

| 文档 | 内容 |
| --- | --- |
| [架构与数据约束](architecture.md) | 目录地图、数据流、坐标、图形、项目兼容、CAM 与接口 |
| [文字与字体管线](text-pipeline.md) | 字体身份、轮廓转换、短线段、快照与编辑会话 |
| [开发协作](development.md) | 开发者与 AI 助手的接手流程、契约同步和仓库约定 |
| [测试与验收](testing.md) | 自动检查、样例用途、交互回归及发行检查 |
| [Python 包说明](../backend/README.md) | 后端包的范围与入口 |
| [使用指南](user-guide.md) | 面向用户的操作说明与快捷键 |
