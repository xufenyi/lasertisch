# LaserTisch

精密二维绘图与激光加工路径工具。在同一界面中绘制图形、编辑文字、设置加工参数、预览路径，并导出设备文件。

![LaserTisch 主界面](docs/images/main-window.png)

## 主要功能

- **精确绘图**：线段、矩形、椭圆和逐点绘制的任意多边形；支持数值输入、网格吸附、移动、旋转、复制、粘贴、重复、撤销和重做。
- **多边形编辑**：支持凹形、孔洞、多个分离部分，以及顶点拖动、插入、删除和坐标编辑。
- **可调椭圆**：通过拖动绘制，按住 Shift 绘制正圆，随时调整边数。
- **单行文字**：附带默认字体，也可选择系统字体；内容、字体、字号和轮廓精度可继续修改，支持短线段合并目标。
- **布尔运算**：预览并应用并集、交集和有顺序的减除，结果可继续编辑。
- **对象管理**：对象可显示、隐藏、锁定和解锁；拖动列表中的排序柄调整加工顺序。
- **加工与导出**：轮廓加工、蛇形填充及组合模式，填充避开孔洞；按指定顺序加工，预览激光路径和空行程，导出 CSV、DBD。
- **项目与语言**：保存可编辑项目；提供简体中文、英语、法语、德语和韩语界面。

工作区最大为 **190 × 190 mm**，坐标精度为 **0.001 mm**。所有加工轮廓均由直线段组成，椭圆和字体曲线通过多边形近似表示。

## 获取与启动

Windows 用户可在本仓库的 **Releases → Assets** 中下载已发布的 `LaserTisch.exe`，双击启动，无需安装 Python 或 Node.js。若尚无发行包，请参阅[开发者入口](docs/README.md)从源码运行。

Windows 需要 [Microsoft WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2)。项目和设备文件保存到你在文件对话框中选择的位置。

目前已在 Windows 上验证运行和打包；Linux、macOS 提供源码运行与打包配置，仍需相应平台实机验证。

## 快速开始

1. 新建项目，确认工作区尺寸与坐标中心。
2. 使用顶部工具绘图；使用文字工具时，先点击画布设置基线位置，再输入内容、预览并应用。
3. 选中对象，在右侧调整几何和加工参数。
4. 在对象列表中拖动排序柄检查加工顺序，开启路径预览，确认填充与空行程。
5. 保存 `.lasertisch.json` 项目，再导出 CSV 或 DBD。

详细操作、快捷键、文字精度和文件说明见[使用指南](docs/user-guide.md)。也可下载并在软件中打开[多边形示例](fixtures/polygons-v2.lasertisch.json)、[椭圆示例](fixtures/ellipses-v2.lasertisch.json)、[布尔示例](fixtures/booleans-v2.lasertisch.json)或[可编辑文字示例](fixtures/editable-text-v2.lasertisch.json)。

## 开发与反馈

- [开发者入口](docs/README.md)：跨平台环境配置、浏览器运行、桌面运行与打包。
- [架构与数据约束](docs/architecture.md)：模块职责、几何模型、加工语义和数据契约。
- [开发协作](docs/development.md)：修改流程、契约同步和文档维护。
- 遇到问题时，请在本仓库的 Issues 中提供操作系统、复现步骤和可分享的示例项目。

## 许可证

项目代码尚未指定开源许可证。复制、分发或用于其他项目之前，请取得项目所有者许可。

随附的 Noto Sans CJK SC 字体按 SIL Open Font License 1.1 授权，版权与完整许可见[字体说明](backend/src/lasertisch/assets/fonts/README.md)。
