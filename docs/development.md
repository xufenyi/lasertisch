# 开发、调试与打包

本文面向维护 LaserTisch 的开发者和自动化编码助手。开始修改前，请先阅读[架构与数据约束](architecture.md)。

## 技术组成

- 前端：React、TypeScript、Material UI、Fabric.js、Zustand、i18next、Vite。
- Python 核心：Pydantic、Shapely、FontTools、uharfbuzz。
- 桌面外壳：pywebview。
- 测试：Vitest、pytest。
- 打包：PyInstaller。

## 目录结构

```text
LaserTisch/
├─ backend/
│  ├─ scripts/                 # 标准输入输出桥接、桌面启动、契约导出
│  ├─ src/lasertisch/
│  │  ├─ application/         # 前端可调用的应用边界
│  │  ├─ cam/                 # 轮廓、扫描填充和有序路径规划
│  │  ├─ desktop/             # pywebview 窗口与原生文件对话框
│  │  ├─ device/              # CSV、DBD 指令映射与编码
│  │  ├─ domain/              # 规范项目、请求、响应和路径模型
│  │  └─ geometry/            # Shapely 转换与精度处理
│  └─ tests/                  # Python 单元测试和契约测试
├─ frontend/
│  ├─ src/
│  │  ├─ components/          # 工具栏、属性面板和文件操作
│  │  ├─ desktop/             # 桌面桥接结果解析
│  │  ├─ domain/              # TypeScript 项目模型和格式校验
│  │  ├─ editor/              # Fabric.js 画布、交互和渲染
│  │  ├─ i18n/                # 语言包加载
│  │  ├─ planning/            # 路径规划、导出客户端与状态
│  │  └─ state/               # 编辑器文档、历史记录和选择状态
│  ├─ package.json
│  └─ vite.config.ts
├─ fixtures/                  # 项目文件示例
├─ locales/                   # 可用文本编辑器修改的 JSON 语言包
├─ packaging/                 # PyInstaller 打包定义
├─ schemas/                   # 前后端共享的 JSON Schema
└─ scripts/                   # 桌面发行包构建入口
```

## 准备开发环境

需要 Python 3.12、Node.js 和 npm；当前验证组合为 Python 3.12、Node.js 24、npm 11。依赖锁定在 `frontend/package-lock.json` 与 `backend/pyproject.toml` 中。

### Windows

以下命令在仓库根目录的 PowerShell 中执行。使用 Anaconda 时，可将第一行的 `python` 换成对应安装目录下的 `python.exe`。

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -e ".\backend[dev]"
Set-Location .\frontend
npm ci
Set-Location ..
```

Anaconda 也可直接创建目录环境：

```powershell
conda create -p .\.venv python=3.12 -y
.\.venv\python.exe -m pip install -e ".\backend[dev]"
```

### Ubuntu

先安装 Python、桌面 WebKit 运行库和 Node.js，再安装项目依赖：

```bash
sudo apt update
sudo apt install python3.12 python3.12-venv python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.1
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e './backend[dev]'
.venv/bin/python -m pip install 'pywebview[gtk]==6.2.1'
cd frontend
npm ci
cd ..
```

### macOS

准备 Python 3.12、Node.js 和 Xcode Command Line Tools 后执行：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -e './backend[dev]'
cd frontend
npm ci
cd ..
```

## 调试运行

### 浏览器开发模式

Vite 开发服务器会把路径规划和设备导出请求转交给本地 Python 进程。默认查找仓库中的 `.venv`；如需指定解释器，设置 `LASERTISCH_PYTHON` 环境变量。

Windows：

```powershell
Set-Location .\frontend
npm run dev
```

Ubuntu 或 macOS：

```bash
cd frontend
npm run dev
```

打开终端显示的本机地址。前端修改可热更新，Python 修改会在下一次规划或导出请求时生效。

### 桌面窗口调试

先生成静态前端，再启动带调试功能的桌面窗口。

Windows：

```powershell
Set-Location .\frontend
npm run build
Set-Location ..
.\.venv\Scripts\python.exe .\backend\scripts\run_desktop.py --debug
```

Anaconda 目录环境的解释器通常位于 `.\.venv\python.exe`。

Ubuntu 或 macOS：

```bash
cd frontend
npm run build
cd ..
.venv/bin/python backend/scripts/run_desktop.py --debug
```

## 检查与测试

Windows：

```powershell
.\.venv\Scripts\python.exe -m pytest .\backend\tests
Set-Location .\frontend
npm test
npm run build
```

Ubuntu 或 macOS：

```bash
.venv/bin/python -m pytest backend/tests
cd frontend
npm test
npm run build
```

使用 Anaconda 目录环境时，把 Windows 示例中的 `.\.venv\Scripts\python.exe` 改为 `.\.venv\python.exe`。

修改 Pydantic 契约后，应从仓库根目录重新生成并检查 Schema：

```powershell
python .\backend\scripts\export_schemas.py
```

前端的对应 TypeScript 类型和解析器需要与 `schemas/` 中的结果保持一致。

文字核心位于 `backend/src/lasertisch/text/`，字体与许可位于 `backend/src/lasertisch/assets/fonts/`。使用当前虚拟环境运行 `backend/scripts/generate_text_examples.py` 可重新生成文字多边形示例、来源快照和默认字体目录示例；此操作不会修改用户项目。默认字体指纹固定在 manifest 中，升级字体需同时更新来源、版权、许可和样例。

`backend/scripts/generate_editable_text_examples.py` 生成阶段 6 的可编辑文字和模拟字体缺失项目。`domain/text_source.py` 为项目实体和生成请求共享的来源模型，避免模型间循环导入。文字编辑面板与 `editorStore` 的会话、候选轮廓配合，不能将预览写入文档或绕过修订检查。短边处理只作用于重新生成的文字轮廓，既有多边形与填充规则保持原有语义。

浏览器开发模式另提供 `/api/fonts` 与 `/api/text-outline`，桌面桥接对应 `font_catalog` 和 `text_outline`。这些接口只查询或生成数据，不修改文档。系统字体目录是本机信息，项目通过字体文件 SHA-256 和集合字面索引标识字体。

## 构建发行包

发行包必须在目标操作系统上构建。构建脚本会先检查并编译前端，再运行 PyInstaller，最后执行内置自检。

### Windows 单文件程序

```powershell
.\.venv\Scripts\python.exe .\scripts\build_desktop.py
```

Anaconda 目录环境使用：

```powershell
.\.venv\python.exe .\scripts\build_desktop.py
```

产物为 `dist\LaserTisch.exe`，这是可以单独分发的单文件程序。目标电脑需要 Windows WebView2 Runtime。

发行包包含默认字体、原版权及 OFL 许可；`--self-test` 同时验证默认字体能生成带孔洞的文字轮廓，不需要启动窗口。PyInstaller 收集 FontTools 动态加载的字体表模块。Python wheel 通过 package-data 包含相同字体资源。

平台图标集中放在 `packaging/icons/`：Windows 使用必需的 `windows.ico`，macOS 可提供 `macos.icns`，Linux 可提供 `linux.png`。Windows 图标已从用户提供的 `scripts/icon-windows.ico` 原样移动，构建时传入 `EXE(icon=...)`；其他平台的配置与待补充文件见[图标说明](../packaging/icons/README.md)。Windows 文件浏览器可能缓存旧图标，验收请使用新生成的 EXE。

字体读取在 `text/diagnostics.py` 中对 FontTools 的两个具体日志源安装过滤器，仅忽略已确认可恢复的时间戳和名称表偏移诊断，不改变全局日志级别，不隐藏其他字体错误或异常堆栈，也不修改系统字体文件。

### Ubuntu

```bash
.venv/bin/python scripts/build_desktop.py
```

产物入口为 `dist/LaserTisch/LaserTisch`。发布时必须保留并分发整个 `dist/LaserTisch/` 目录。

### macOS

```bash
.venv/bin/python scripts/build_desktop.py
```

产物为 `dist/LaserTisch.app`。可在 Finder 中打开，也可从终端执行 `dist/LaserTisch.app/Contents/MacOS/LaserTisch`。

## 语言包

界面文字位于 `locales/*.json`。五个文件必须保持相同的键结构：

- `zh-CN.json`：简体中文，默认语言。
- `en.json`：英语。
- `fr.json`：法语。
- `de.json`：德语。
- `ko.json`：韩语。

语言包随前端一起打入桌面程序。修改后重新构建前端或发行包即可生效。

## 提交前检查

1. 确认没有改变整数微米、0.1° 角度和固定加工顺序等核心约束。
2. 运行 Python 测试、前端测试和前端生产构建。
3. 若改动了契约，重新生成 Schema，并检查 TypeScript 解析器。
4. 若改动了桌面入口、文件保存或设备编码，重新构建当前平台发行包并启动验证。
5. 不要提交 `.venv/`、`node_modules/`、`build/`、`dist/`、`frontend/web-dist/` 或测试缓存。
