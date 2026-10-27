"""命令行运行入口。"""

import argparse
import glob
import os
import sys
from pathlib import Path
from typing import Sequence

from .csv_io import CSVFormatError, read_motion_csv, write_motion_csv
from .dbd_codec import DBDFormatError, decode_dbd, encode_dbd


CSV_DESCRIPTION = (
    "CSV固定为四列：command,x,y,speed。command只能是jump或mark；"
    "x、y单位为mm，speed单位为mm/s。首行表头command,x,y,speed可省略。"
)


def build_argument_parser() -> argparse.ArgumentParser:
    """创建带中文说明和encode/decode子命令的参数解析器。"""
    parser = argparse.ArgumentParser(
        prog="csv-dbd-converter",
        description=(
            "在运动命令CSV和二进制DBD之间转换。程序不会连接或控制打印机。"
        ),
        epilog=(
            "示例：csv-dbd-converter encode path.csv；"
            "csv-dbd-converter decode path.dbd -o restored.csv"
        ),
    )
    subparsers = parser.add_subparsers(dest="operation", required=True)

    encode_parser = subparsers.add_parser(
        "encode",
        help="把CSV编码为DBD",
        description=(
            f"把运动命令CSV编码为DBD。{CSV_DESCRIPTION} "
            "LaserOnDelay、LaserOffDelay、JumpDelay、MarkDelay固定写为0；"
            "只有同类型运动的速度变化时才写入新的速度参数。"
        ),
    )
    encode_parser.add_argument(
        "inputs",
        nargs="+",
        metavar="CSV_FILE",
        help=f"一个或多个输入CSV文件或通配符。{CSV_DESCRIPTION}",
    )
    encode_parser.add_argument(
        "-o",
        "--output",
        type=Path,
        metavar="DBD_FILE",
        help=(
            "输出的二进制DBD文件；只能用于单个输入。省略时将输入扩展名"
            "替换为.dbd；如果文件已存在，将覆盖该文件"
        ),
    )

    decode_parser = subparsers.add_parser(
        "decode",
        help="把DBD解码为CSV",
        description=(
            "把支持的二进制DBD命令流解码为CSV。解码后的每条Jump或Mark"
            "都会带上当时有效的对应速度。"
        ),
    )
    decode_parser.add_argument(
        "inputs",
        nargs="+",
        metavar="DBD_FILE",
        help="一个或多个输入DBD文件或通配符",
    )
    decode_parser.add_argument(
        "-o",
        "--output",
        type=Path,
        metavar="CSV_FILE",
        help=(
            f"输出CSV文件。{CSV_DESCRIPTION} 只能用于单个输入；省略时将输入"
            "扩展名替换为.csv；如果文件已存在，将覆盖该文件"
        ),
    )
    return parser


class CLIPathError(ValueError):
    """命令行中的文件路径或扩展名不符合要求。"""


def _normalized_path_key(path: Path) -> str:
    """返回适合当前平台进行路径去重和冲突检查的键。"""
    return os.path.normcase(os.path.abspath(os.fspath(path)))


def _expand_inputs(patterns: Sequence[str], expected_suffix: str) -> list[Path]:
    """展开用户输入及通配符，保持顺序并去除重复路径。"""
    paths: list[Path] = []
    seen: set[str] = set()

    for pattern in patterns:
        if glob.has_magic(pattern):
            matches = sorted(glob.glob(pattern, recursive=True))
            if not matches:
                raise CLIPathError(f"通配符没有匹配任何文件：{pattern}")
        else:
            matches = [pattern]

        for match in matches:
            path = Path(match)
            if path.suffix.lower() != expected_suffix:
                raise CLIPathError(
                    f"输入文件必须使用{expected_suffix}扩展名：{path}"
                )
            if not path.is_file():
                raise CLIPathError(f"输入路径不是可读取的文件：{path}")
            key = _normalized_path_key(path)
            if key not in seen:
                seen.add(key)
                paths.append(path)

    return paths


def _plan_conversions(
    patterns: Sequence[str],
    output: Path | None,
    input_suffix: str,
    output_suffix: str,
) -> list[tuple[Path, Path]]:
    """验证参数并生成输入与输出路径的映射。"""
    inputs = _expand_inputs(patterns, input_suffix)

    if output is not None:
        output_text = os.fspath(output)
        if glob.has_magic(output_text):
            raise CLIPathError("输出文件名不能包含通配符")
        if output.suffix.lower() != output_suffix:
            raise CLIPathError(
                f"输出文件必须使用{output_suffix}扩展名：{output}"
            )
        if len(inputs) != 1:
            raise CLIPathError("-o/--output只能与单个输入文件一起使用")
        return [(inputs[0], output)]

    conversions = [(path, path.with_suffix(output_suffix)) for path in inputs]
    output_keys = [_normalized_path_key(target) for _, target in conversions]
    if len(output_keys) != len(set(output_keys)):
        raise CLIPathError("多个输入文件会生成相同的输出路径")
    return conversions


def _encode_file(csv_file: Path, dbd_file: Path) -> None:
    commands = read_motion_csv(csv_file)
    binary_data = encode_dbd(commands)
    dbd_file.write_bytes(binary_data)
    print(
        f"转换完成：{len(commands)}条运动命令，"
        f"写入{len(binary_data)}字节 -> {dbd_file.resolve()}"
    )


def _decode_file(dbd_file: Path, csv_file: Path) -> None:
    binary_data = dbd_file.read_bytes()
    commands = decode_dbd(binary_data)
    write_motion_csv(csv_file, commands)
    print(
        f"转换完成：读取{len(binary_data)}字节，"
        f"解码{len(commands)}条运动命令 -> {csv_file.resolve()}"
    )


def main(argv: Sequence[str] | None = None) -> int:
    """解析参数、执行转换并返回进程退出码。"""
    parser = build_argument_parser()
    args = parser.parse_args(argv)

    try:
        if args.operation == "encode":
            conversions = _plan_conversions(
                args.inputs, args.output, ".csv", ".dbd"
            )
            for source, target in conversions:
                _encode_file(source, target)
            return 0

        conversions = _plan_conversions(
            args.inputs, args.output, ".dbd", ".csv"
        )
        for source, target in conversions:
            _decode_file(source, target)
        return 0
    except (
        OSError,
        CSVFormatError,
        DBDFormatError,
        CLIPathError,
        ValueError,
    ) as exc:
        print(f"错误：{exc}", file=sys.stderr)
        return 1
