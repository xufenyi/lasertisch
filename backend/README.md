# LaserTisch Python 核心

本目录提供 LaserTisch 的规范数据模型、几何转换、加工路径规划、设备文件编码和桌面程序入口。前端负责交互与显示，最终的项目校验、路径计算和 CSV/DBD 编码由此包完成。

## 入口

- [开发者入口](../docs/README.md)：Python 3.12 虚拟环境、跨平台依赖、运行与打包命令。
- [架构与数据约束](../docs/architecture.md)：模块职责、坐标、几何、CAM 和数据契约。
- [文字与字体管线](../docs/text-pipeline.md)：字体身份、离散、短边和固定轮廓。
- [测试与验收](../docs/testing.md)：pytest、前端验证及交互回归。

安装、测试和脚本均应使用项目虚拟环境。标准输入输出桥接、Schema 导出、示例生成及桌面源码启动入口位于 `scripts/`；桌面发行包构建入口位于仓库根目录的 `scripts/build_desktop.py`。

