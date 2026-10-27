# 阶段 0 架构基线

状态：已实施并由自动测试保护。后续阶段若修改本文件中的规则，必须同步提高格式
版本或更新兼容迁移和测试。

## 产品边界

LaserTisch 是面向激光加工的轻量二维 CAD/CAM 应用，不是通用绘图软件。编辑器
负责采集规范几何，Python 核心负责几何计算和路径规划，设备适配器负责把设备
无关轨迹映射为目标设备的 Jump/Mark 指令。

## 权威数据边界

1. `ProjectDocument` 是唯一可持久化的权威状态。
2. Fabric.js 对象只是 `ProjectDocument` 的交互投影。
3. Shapely 对象是临时计算表示，不直接保存。
4. `ToolpathPlan` 是带输入修订号的派生结果，默认不保存到项目文件。
5. 设备命令只在导出时生成，不能反向成为编辑器几何。

工作区默认且最大为 190 mm × 190 mm；宽、高和工作区中心的世界坐标属于项目
状态并可修改。世界坐标原点不会随工作区中心移动。

## 模块依赖方向

```text
React UI → 规范文档 → Bridge DTO → Geometry/CAM → ToolpathPlan → Device Adapter
   ↓          ↑
Fabric.js 投影┘
```

任何箭头不得反向：CAM 不导入 GUI，设备编码不导入 Fabric，规范模型也不保存
Fabric 的 `left`、`top`、`scaleX`、`scaleY` 或 viewport transform。

## 第一版实体

- `RectangleEntity`：中心、宽、高、0.1° 顺时针角度。
- `LineEntity`：有序起点和终点。
- `PolygonEntity`：布尔运算烘焙结果；可包含多个分离 part 和孔洞。

布尔操作以一次可撤销事务替换所有参与对象。结果继承首个选择对象的加工参数；
参数不同时必须先确认。原对象只通过撤销历史保留，不保存在结果实体内部。

## 加工及设备顺序

- `processingOrder` 必须恰好包含每个实体一次。
- 规划器不得重排对象。
- 线段始终由起点加工至终点。
- 每个设备程序以 `InitialJump` 到世界原点开始。
- 最后一个加工点即程序停靠点，不追加返回动作。

## 版本与迁移

- 项目格式初始版本为 `schemaVersion = 1`。
- Bridge 初始版本为 `apiVersion = 1`。
- 未识别字段一律拒绝，避免拼写错误被静默忽略。
- 将来的加载流程必须先按 `schemaVersion` 迁移，再进入当前模型验证。

## 阶段边界

阶段 0 交付规范模型、JSON Schema、Bridge 契约、语言包和测试基线，不包含
Shapely 运算、CAM 实现、React 编辑器或 pywebview 窗口。后续功能按阶段授权实施。

