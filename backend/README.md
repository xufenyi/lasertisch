# LaserTisch Python 核心

本目录提供 LaserTisch 的规范数据模型、几何转换、加工路径规划、设备文件编码和桌面程序入口。前端负责交互与显示，最终的项目校验、路径计算和 CSV/DBD 编码由此包完成。

## 安装

在仓库根目录执行：

```powershell
python -m pip install -e ".\backend[dev]"
```

Python 版本必须为 3.12。

## 运行测试

```powershell
python -m pytest .\backend\tests
```

## 直接启动桌面程序

先在 `frontend` 目录执行 `npm run build`，再回到仓库根目录执行：

```powershell
python .\backend\scripts\run_desktop.py --debug
```

完整的环境准备、跨平台命令和模块说明见[开发者文档](../docs/development.md)，核心数据流和精度约束见[架构文档](../docs/architecture.md)。

