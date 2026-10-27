# LaserTisch

LaserTisch 是一个面向激光加工的轻量二维 CAD/CAM 桌面应用。项目使用
React、TypeScript 和 Fabric.js 提供几何编辑，使用 Python 和 Shapely 负责
计算几何及设备无关路径规划，并通过 pywebview 组成跨平台桌面应用。

当前开发进度：**阶段 6——设备协议集成已实现，等待手动验收**。当前版本会把
经过校验的有序加工路径导出为可读 CSV 或目标设备 DBD 文件。阶段 5 已按产品
决策暂缓；任意多边形编辑系统完成后，再实现布尔运算等高级功能。

## 已锁定的核心约束

- 工作区默认且最大为 190 mm × 190 mm，宽、高和世界坐标中心可修改。
- 规范几何使用整数微米，合法范围由当前工作区中心和尺寸决定。
- 用户角度使用 0.1° 整数、顺时针为正，并归一化到 `[0, 360)`。
- 软件严格保留对象加工顺序；线段严格从端点 1 加工到端点 2。
- 每个设备程序都以激光关闭的绝对跳转 `(0, 0)` 开始。
- 默认空行程速度为 10000 mm/s，与当前黄金样本一致。

详细约束见 [阶段 0 架构基线](docs/architecture/phase-0-baseline.md)。

## Python 开发环境

项目环境位于 `.venv`，Python 版本为 3.12。无需激活即可执行：

```powershell
.\.venv\python.exe -m pip install -e ".\csv-dbd-converter"
.\.venv\python.exe -m pip install -e ".\backend[dev]"
.\.venv\python.exe -m pytest .\backend\tests
```

生成或检查共享 JSON Schema：

```powershell
.\.venv\python.exe .\backend\scripts\export_schemas.py
```

`csv-dbd-converter` 是设备文件编解码模块，`csv_dbd` 保存等效 CSV/DBD 黄金
样本。设备编码只依赖设备无关的 `ToolpathPlan`，不会依赖矩形等编辑器图元。

## 启动前端编辑器

首次使用或依赖变化后：

```powershell
cd .\frontend
npm install
```

启动开发版本：

```powershell
npm run dev
```

随后打开终端显示的本机地址（通常是 `http://localhost:5173`）。

开发服务器会自动使用项目 `.venv` 中的 Python 规划器，无需另开后端进程。

工具栏的下载按钮提供“导出 CSV”和“导出 DBD”。导出时会使用当前文档版本的
路径；如果预览未开启或路径尚未生成，软件会先自动规划，再开始下载。

