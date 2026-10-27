# CSV/DBD 双向转换器

本项目用于在激光扫描路径的可读格式（`.csv`）和二进制格式（`.dbd`）之间转换。既可以作为命令行工具使用，也可以作为 Python 包调用。

## 安装

在项目目录中执行：

```bash
python -m pip install .
```

开发时可以使用可编辑安装：

```bash
python -m pip install -e .
```

普通安装会把当时的代码复制到 Python 环境中，之后修改项目源码需要再次执行 `python -m pip install .`。可编辑安装会让环境直接引用当前项目源码，修改 `.py` 文件后通常不必重新安装；修改 `pyproject.toml`、命令入口、版本或依赖时仍应重新执行可编辑安装命令。

安装到当前 Python 或 Conda 环境后，可以直接运行：

```bash
csv-dbd-converter --help
```

也可以通过模块运行：

```bash
python -m csv_dbd_converter --help
```

## 构建和迁移

安装构建工具并生成发行文件：

```bash
python -m pip install build
python -m build
```

生成的文件位于 `dist/`：

- `csv_dbd_converter-0.1.0-py3-none-any.whl` 是跨 Windows、Linux 和 macOS 使用的纯 Python wheel，适合直接复制到其它电脑安装。
- `csv_dbd_converter-0.1.0.tar.gz` 是源码发行包，可用于重新构建或审查源码。

在目标电脑安装 Python 3.10 或更高版本，将 wheel 复制过去，然后执行：

```bash
python -m pip install csv_dbd_converter-0.1.0-py3-none-any.whl
```

安装不需要联网，因为本项目没有运行时第三方依赖。建议先激活目标虚拟环境或 conda 环境，确保命令安装到正确的环境。安装后可以执行：

```bash
csv-dbd-converter --help
python -c "from csv_dbd_converter.dbd_codec import encode_dbd; print(encode_dbd)"
```

升级到新构建的版本时，应先在 `pyproject.toml` 和 `src/csv_dbd_converter/__init__.py` 中同步更新版本号，再重新构建并执行：

```bash
python -m pip install --upgrade csv_dbd_converter-新版本-py3-none-any.whl
```

## 命令行用法

编码 CSV。省略输出文件名时，输出为同目录、同名的 `.dbd` 文件：

```bash
csv-dbd-converter encode example.csv
```

使用 `-o` 或 `--output` 显式指定输出文件：

```bash
csv-dbd-converter encode example.csv -o result.dbd
```

解码 DBD：

```bash
csv-dbd-converter decode example.dbd
csv-dbd-converter decode example.dbd --output result.csv
```

输入支持通配符和多个文件。每个输入都会生成一个替换扩展名后的输出文件：

```bash
csv-dbd-converter encode ./*.csv
csv-dbd-converter decode output/*.dbd
```

`-o/--output` 只能用于单个输入。`encode` 的输入和输出扩展名必须分别为 `.csv` 和 `.dbd`；`decode` 则相反。扩展名不区分大小写。目标文件已存在时会被覆盖。

从源码目录运行时，也保留兼容入口：

```bash
python main.py encode example.csv
```

## Python API

数据模型和编解码函数可以直接导入：

```python
from csv_dbd_converter.models import MotionCommand, MotionKind
from csv_dbd_converter.dbd_codec import encode_dbd, decode_dbd
from csv_dbd_converter.csv_io import read_motion_csv, write_motion_csv

commands: list[MotionCommand] = [
    MotionCommand(kind="jump", x_mm=0, y_mm=0, speed_mm_s=7000),
    MotionCommand(kind="mark", x_mm=10, y_mm=0, speed_mm_s=500),
]

data = encode_dbd(commands)
restored = decode_dbd(data)
```

## CSV 格式

CSV 固定为四列：

```csv
command,x,y,speed
jump,0,0,7000
mark,10,0,500
jump,0,5,7000
mark,10,5,600
```

- `command`：只能是 `jump` 或 `mark`。`jump` 表示改变位置且不出激光，`mark` 表示改变位置且出激光。
- `x`、`y`：绝对目标坐标，单位为 mm。
- `speed`：本次运动速度，单位为 mm/s，必须大于 0。
- 表头 `command,x,y,speed` 可以省略。

## 编码规则

- `LaserOnDelay`、`LaserOffDelay`、`JumpDelay`、`MarkDelay` 固定为 `0`。
- `StepPeriod` 按厂商默认值固定为 `100`。
- `jump` 与 `mark` 分别维护各自的当前速度。
- 只有本次同类型运动的速度与上次不同时，才写入新的速度参数。
- 坐标从 mm 转换为 inch 后写成小端 float32。
- 速度从 mm/s 转换为 inch/s 后写成小端 float32。
