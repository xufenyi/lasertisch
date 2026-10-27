# 架构与数据约束

本文记录 LaserTisch 当前代码的职责边界和不可破坏的数据语义，供维护者与自动化编码助手在缺少历史上下文时快速定位实现。

## 总体数据流

```text
用户操作
  ↓
React 组件与 Fabric.js 画布
  ↓
Zustand 中的规范项目文档
  ↓  规划请求（项目快照 + 文档修订号）
Python 应用边界与 Pydantic 校验
  ↓
Shapely 几何转换 → CAM 路径规划
  ↓
设备无关 ToolpathPlan
  ↓
CSV 或 DBD 编码 → 原生保存对话框
```

前端状态中的 `EditorDocument` 与后端的 `ProjectDocument` 是同一份版本 1 契约。Fabric.js 对象和 Shapely 几何只是显示或计算投影，不能作为项目持久化来源。

## 关键模块

| 位置 | 职责 |
| --- | --- |
| `frontend/src/state/editorStore.ts` | 项目状态、选择、加工顺序、撤销与重做 |
| `frontend/src/editor/CanvasSurface.tsx` | 画布交互、绘制、拖动、缩放、标尺和路径叠加 |
| `frontend/src/domain/` | TypeScript 契约、单位转换、项目文件和响应解析 |
| `frontend/src/planning/` | 规划请求、过期响应隔离、预览与导出状态 |
| `backend/src/lasertisch/domain/` | Pydantic 规范模型及请求、响应模型 |
| `backend/src/lasertisch/geometry/` | 规范模型与 Shapely 之间的转换和量化 |
| `backend/src/lasertisch/cam/` | 轮廓方向、扫描填充和任务顺序 |
| `backend/src/lasertisch/device/` | 路径连续性检查、运动命令和 CSV/DBD 编码 |
| `backend/src/lasertisch/application/bridge.py` | 桌面与开发服务器共用的稳定调用边界 |
| `backend/src/lasertisch/desktop/` | pywebview 生命周期和原生打开、保存对话框 |

## 坐标、单位与角度

- 世界坐标单位为整数微米，`1000 μm = 1 mm`。项目文件内部只保存整数，界面边界再与毫米文本互换。
- 工作区宽、高都必须大于 0 且不超过 `190000 μm`。工作区中心可以位于任意世界坐标，因而允许负坐标。
- 所有图形必须完整落在当前工作区中。旋转矩形以自身中心旋转，并以旋转后的四个角检查边界。
- 矩形由中心点、宽、高和角度描述；线段由有方向的起点与终点描述。
- 用户角度以顺时针为正，保存为 0.1° 的整数，并归一化到 `[0, 3600)`。
- Shapely 采用毫米浮点坐标；转换结果会量化回微米网格，防止计算噪声进入规范文档或设备路径。

## 项目文档

项目文件使用 UTF-8 JSON，扩展名为 `.lasertisch.json`，当前 `schemaVersion` 为 `1`。主要字段包括：

- `workArea`：尺寸、中心和中心原点语义。
- `grid`：显示、间距、移动吸附和缩放吸附。
- `defaultProcess`：新建对象使用的加工参数。
- `globalSettings`：空行程速度、最短加工线段和原点起跳约束。
- `entities`：图形及其加工参数。
- `processingOrder`：包含每个对象标识且不重复的完整顺序。

打开项目时必须完整解析和校验，不能把未知或越界数据直接送入画布。保存时以规范文档为准，不序列化 Fabric.js 内部状态。

## 编辑器状态

编辑器把一次有意义的文档修改记录为一个历史快照。画布拖动期间可以连续显示数值，但一次拖动只应形成一次可撤销操作。属性输入在有效时提交；切换选择时不需要额外的“应用”动作。

每次文档变化都会增加 `documentRevision`。路径响应必须同时匹配请求标识和修订号；旧响应不能覆盖新文档。路径预览默认关闭，导出时如果没有当前修订号对应的缓存路径，则先执行一次规划。

## 加工路径语义

### 顺序

- `processingOrder` 是强制顺序，规划器不得按距离重排对象。
- `none` 模式的对象跳过，其余对象按列表顺序各自产生一个任务。
- 线段严格从保存的起点加工到终点，不允许为了缩短空行程而翻转。
- 闭合轮廓遵循对象的顺时针或逆时针属性；每个环从离当前位置最近的现有顶点开始。

### 填充

- 扫描线以世界坐标原点和间距为基准，不随对象旋转。
- 0° 平行于世界坐标 X 轴，正角度为顺时针。
- 扫描线与边界或顶点相切时仍参与求交。
- 量化后的有效加工段长度不能小于 `100 μm`。
- 相邻的非空扫描行使用往返方向，减少不必要的空行程。

### 运动段

`ToolpathPlan` 包含一个前导动作和按对象分组的连续运动段：

- 前导动作始终是从设备未知当前位置以激光关闭状态跳转到世界坐标 `(0, 0)`。
- `travel` 表示激光关闭的绝对移动。
- `contour`、`hatch` 和 `open_line` 表示激光开启的加工移动。
- 每个运动段的起点必须等于上一段终点，序号必须从 0 连续递增。
- 规划结束后不追加停靠动作，设备停留在最后一个目标点。

## 设备导出

`backend/src/lasertisch/device/exporter.py` 只接受已经校验的 `ToolpathPlan`，不依赖编辑器图形类型。每个前导动作或路径段映射为一条绝对运动命令：

- `jump`：从上一命令点到本命令目标点期间激光关闭。
- `mark`：从上一命令点到本命令目标点期间激光开启。

CSV 使用 UTF-8 文本，表头为 `command,x,y,speed`，坐标单位为毫米，速度单位为毫米每秒。DBD 使用小端二进制记录，包含设备参数、速度更新和绝对坐标命令；编码实现位于 `device/protocol.py`。软件只编码空行程速度和加工速度，不处理设备加速度或底层运动分辨率。

导出请求携带路径的输入修订号。修订号不一致、路径不连续、任务标识不匹配或序号断裂时，必须拒绝生成文件。

## 应用桥接与桌面外壳

应用边界暴露两个纯数据方法：

- `plan_toolpaths`：校验项目快照并返回设备无关路径。
- `export_device_program`：校验路径并返回 Base64 编码的 CSV 或 DBD 内容。

开发模式由 Vite 中间件启动短生命周期 Python 进程；桌面模式通过 pywebview 的 JavaScript API 调用同一应用边界。原生文件 API 负责：

- 打开不超过 20 MiB 的 UTF-8 项目文件。
- 以临时文件加原子替换方式保存项目文件。
- 解码并保存不超过 100 MiB 的 CSV 或 DBD 文件。
- 清理建议文件名中的 Windows 非法字符并补齐扩展名。

打包后的前端文件位于运行时资源目录 `web/`。桌面入口通过内置本地 HTTP 服务加载这些资源，并禁用普通网页下载，让文件写入统一经过原生保存对话框。

## 契约与测试

`schemas/` 是 Pydantic 模型导出的 JSON Schema，用来审查前后端契约是否同步。对应范围如下：

- `project-v1.schema.json`：项目文档。
- `plan-request-v1.schema.json`、`plan-response-v1.schema.json`：路径规划。
- `export-request-v1.schema.json`、`export-response-v1.schema.json`：设备导出。

Python 测试覆盖数据模型、单位、几何转换、轮廓、填充、规划、桥接、桌面文件 API、设备编码和语言包。前端测试覆盖单位与几何、项目文件、工具快捷键、Fabric.js 适配、路径渲染、状态历史、规划客户端和桌面桥接。

修改数据契约时，应同时更新 Pydantic 模型、TypeScript 类型与解析器、Schema 和两端测试。修改坐标或路径逻辑时，应优先补充整数微米边界、方向、相切、最短线段、顺序及连续性用例。
