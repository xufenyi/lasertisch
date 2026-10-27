# React 与 Python Bridge 契约

## 调用模型

pywebview API 以异步 Promise 方式调用。正常数据流由 React 主动调用 Python；
Python 不使用任意 JavaScript 字符串推送业务状态。

第一版公开方法计划为：

- `get_capabilities()`
- `validate_project(document)`
- `plan_toolpaths(request)`
- `open_project()`
- `save_project(document, target)`
- `export_device_program(request)`
- `boolean_operation(request)`，阶段 5 才开放

## 规划请求

`PlanRequest` 包含：

- `apiVersion`
- `requestId`
- `documentRevision`
- 完整 `ProjectDocument`

第一版传递完整文档，优先保证一致性。只有性能测试证明需要后，才增加增量请求。

## 规划响应

`PlanResponse` 必须回显 `requestId` 和 `documentRevision`。前端仅接受修订号等于
当前文档的结果，晚到的旧结果直接丢弃。

成功响应必须有 plan 且没有 errors；失败响应必须没有 plan 且至少有一个 error。
错误和警告使用稳定代码及参数，由前端语言包翻译，Python 不返回需要业务逻辑
解析的自然语言文本。

## 更新流程

```text
规范文档事务提交
  → revision + 1
  → 150–300 ms 防抖
  → plan_toolpaths
  → 核对 requestId/revision
  → 更新不可选择的批量 Canvas2D 预览层
```

Bridge 方法应尽量无状态。文件对话框和其他不可避免的共享状态需要串行化；CAM
函数本身不得依赖窗口或全局当前文档。

## 设备导出请求

`ExportRequest` 只包含已接受的 `ToolpathPlan`、格式（`csv` 或 `dbd`）、请求标识
和文档修订号。Python 会再次校验 plan 的输入修订号、全局序号、任务归属和线段
连续性，再把文件内容作为 base64 返回。前端核对请求标识和修订号后才触发下载。

该接口不接收矩形、线段或未来多边形等编辑器图元。高级绘图功能只需产出同一
`ToolpathPlan`，无需了解 CSV/DBD 编码。

