"""源码目录中的兼容命令入口。"""

from pathlib import Path
import sys


sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from csv_dbd_converter.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
