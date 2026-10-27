"""读取和写入运动命令 CSV 文件。"""

import csv
import io
import math
from pathlib import Path
from typing import Iterable, cast

from .models import MotionCommand, MotionKind


CSV_HEADER = ("command", "x", "y", "speed")


class CSVFormatError(ValueError):
    """CSV 的列数、命令或数值不符合要求。"""


def _parse_finite_float(text: str, field_name: str, line_number: int) -> float:
    """解析有限浮点数，并给出包含 CSV 行号的错误信息。"""
    try:
        value = float(text.strip())
    except ValueError as exc:
        raise CSVFormatError(
            f"CSV第{line_number}行的{field_name}不是有效数字：{text!r}"
        ) from exc

    if not math.isfinite(value):
        raise CSVFormatError(
            f"CSV第{line_number}行的{field_name}必须是有限数字：{text!r}"
        )
    return value


def read_motion_csv(path: Path) -> list[MotionCommand]:
    """从 CSV 读取运动命令。"""
    commands: list[MotionCommand] = []
    first_nonempty_row = True

    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream)
        for line_number, row in enumerate(reader, start=1):
            if not row or all(not cell.strip() for cell in row):
                continue

            normalized = tuple(cell.strip().lower() for cell in row)
            if first_nonempty_row and normalized == CSV_HEADER:
                first_nonempty_row = False
                continue
            first_nonempty_row = False

            if len(row) != 4:
                raise CSVFormatError(
                    f"CSV第{line_number}行应有4列(command,x,y,speed)，"
                    f"实际有{len(row)}列"
                )

            kind_text = row[0].strip().lower()
            if kind_text not in ("jump", "mark"):
                raise CSVFormatError(
                    f"CSV第{line_number}行的command只能是jump或mark：{row[0]!r}"
                )

            x_mm = _parse_finite_float(row[1], "x", line_number)
            y_mm = _parse_finite_float(row[2], "y", line_number)
            speed_mm_s = _parse_finite_float(row[3], "speed", line_number)
            if speed_mm_s <= 0.0:
                raise CSVFormatError(
                    f"CSV第{line_number}行的speed必须大于0：{speed_mm_s}"
                )

            commands.append(
                MotionCommand(
                    kind=cast(MotionKind, kind_text),
                    x_mm=x_mm,
                    y_mm=y_mm,
                    speed_mm_s=speed_mm_s,
                )
            )

    if not commands:
        raise CSVFormatError("CSV中没有任何运动命令")
    return commands


def _format_decimal(value: float) -> str:
    """把解码后的 float32 写成简洁且足够准确的十进制文本。"""
    nearest_integer = round(value)
    float32_tolerance = max(1e-6, abs(value) * 6e-8)
    if math.isclose(
        value, nearest_integer, rel_tol=0.0, abs_tol=float32_tolerance
    ):
        return str(nearest_integer)
    return f"{value:.9f}".rstrip("0").rstrip(".")


def write_motion_csv(path: Path, commands: Iterable[MotionCommand]) -> None:
    """把运动命令写成带英文表头的 UTF-8 CSV 文件。"""
    path.write_bytes(encode_motion_csv(commands))


def encode_motion_csv(commands: Iterable[MotionCommand]) -> bytes:
    """把运动命令编码为可直接保存的 UTF-8 CSV 字节。"""
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(CSV_HEADER)
    for command in commands:
        writer.writerow(
            (
                command.kind,
                _format_decimal(command.x_mm),
                _format_decimal(command.y_mm),
                _format_decimal(command.speed_mm_s),
            )
        )
    return stream.getvalue().encode("utf-8")
