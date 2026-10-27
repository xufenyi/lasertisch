"""二进制DBD命令流的编码和解码。

本模块是独立实现，不导入或调用项目根目录中的厂商程序。DBD中的整数和
IEEE-754单精度浮点数均采用小端序。坐标存储为英寸，速度存储为英寸/秒。
"""


import math
import struct
from itertools import chain
from typing import Iterable

from .models import MotionCommand


MM_PER_INCH = 25.4

# 二进制命令字。uint16使用小端序，所以文件中分别表现为43 49、4F 4C、41 4D。
SCAN_PARAMETER_COMMAND = 0x4943
MARK_ABSOLUTE_COMMAND = 0x4C4F
JUMP_ABSOLUTE_COMMAND = 0x4D41

# 扫描参数ID。
LASER_ON_DELAY_ID = 0
LASER_OFF_DELAY_ID = 1
JUMP_SPEED_ID = 2
MARK_SPEED_ID = 3
JUMP_DELAY_ID = 4
MARK_DELAY_ID = 5
STEP_PERIOD_ID = 6

# 所有延迟写死为0。StepPeriod不是延迟，沿用已知格式中的100。
FIXED_DELAY_VALUE = 0
FIXED_STEP_PERIOD = 100
DEFAULT_JUMP_SPEED_MM_S = 7000.0
DEFAULT_MARK_SPEED_MM_S = 1000.0

SHORT_PARAMETER_IDS = {
    LASER_ON_DELAY_ID,
    LASER_OFF_DELAY_ID,
    JUMP_DELAY_ID,
    MARK_DELAY_ID,
    STEP_PERIOD_ID,
}
FLOAT_PARAMETER_IDS = {JUMP_SPEED_ID, MARK_SPEED_ID}


class DBDFormatError(ValueError):
    """DBD文件包含未知、截断或在当前格式下不安全的记录。"""


def _encode_short_parameter(parameter_id: int, value: int) -> bytes:
    """编码一个uint16扫描参数记录。"""
    if not 0 <= value <= 0xFFFF:
        raise ValueError(f"uint16参数超出范围：{value}")
    return struct.pack("<HBH", SCAN_PARAMETER_COMMAND, parameter_id, value)


def _encode_float_parameter(parameter_id: int, value: float) -> bytes:
    """编码一个float32扫描参数记录。"""
    if not math.isfinite(value):
        raise ValueError(f"浮点参数必须是有限数：{value}")
    return struct.pack("<HBf", SCAN_PARAMETER_COMMAND, parameter_id, value)


def _speed_payload(speed_mm_s: float) -> bytes:
    """返回速度转换为英寸/秒后的规范float32字节。

    编码器通过比较该字节串判断速度在DBD中是否真正发生变化。这样可避免
    两个十进制数在转换为float32后完全相同时仍写入多余的速度命令。
    """
    if not math.isfinite(speed_mm_s) or speed_mm_s <= 0.0:
        raise ValueError(f"速度必须是大于0的有限数：{speed_mm_s}")
    try:
        return struct.pack("<f", speed_mm_s / MM_PER_INCH)
    except OverflowError as exc:
        raise ValueError(f"速度超出float32范围：{speed_mm_s}") from exc


def _encode_motion(command: MotionCommand) -> bytes:
    """编码一条绝对坐标Jump或Mark命令。"""
    opcode = (
        JUMP_ABSOLUTE_COMMAND if command.kind == "jump" else MARK_ABSOLUTE_COMMAND
    )
    if not math.isfinite(command.x_mm) or not math.isfinite(command.y_mm):
        raise ValueError("坐标必须是有限数")
    try:
        return struct.pack(
            "<Hff",
            opcode,
            command.x_mm / MM_PER_INCH,
            command.y_mm / MM_PER_INCH,
        )
    except OverflowError as exc:
        raise ValueError(
            f"坐标超出float32范围：({command.x_mm}, {command.y_mm})"
        ) from exc


def encode_dbd(commands: Iterable[MotionCommand]) -> bytes:
    """把运动命令编码成DBD二进制字节流。

    文件开头始终写入JumpSpeed和MarkSpeed。两者默认分别为7000 mm/s和
    1000 mm/s；第一条运动会用自身速度覆盖同类型的默认值，因此不会在第一条
    运动前重复写一次速度。此后分别记忆Jump和Mark最近一次写入DBD的float32
    值，只有本次同类型运动的速度发生变化时，才插入相应的速度参数记录。

    Args:
        commands: 按执行顺序排列的运动命令。

    Returns:
        可以直接写入``.dbd``文件的字节串。

    Raises:
        ValueError: 命令类型、坐标或速度不合法。
    """
    command_iterator = iter(commands)
    try:
        first_command = next(command_iterator)
    except StopIteration as exc:
        raise ValueError("不能生成不含运动命令的DBD文件") from exc

    if first_command.kind not in ("jump", "mark"):
        raise ValueError(f"未知运动类型：{first_command.kind!r}")

    # 两类速度都必须在文件开头出现。第一条运动只覆盖与其同类型的默认速度；
    # 另一类速度仍采用默认值，确保打印机在执行任何运动前已获得完整参数。
    initial_jump_speed_payload = _speed_payload(DEFAULT_JUMP_SPEED_MM_S)
    initial_mark_speed_payload = _speed_payload(DEFAULT_MARK_SPEED_MM_S)
    first_speed_payload = _speed_payload(first_command.speed_mm_s)
    if first_command.kind == "jump":
        initial_jump_speed_payload = first_speed_payload
    else:
        initial_mark_speed_payload = first_speed_payload

    initial_jump_speed_inch_s = struct.unpack("<f", initial_jump_speed_payload)[0]
    initial_mark_speed_inch_s = struct.unpack("<f", initial_mark_speed_payload)[0]

    result = bytearray()

    # 按参数ID 0~6写出完整文件头。四个延迟固定为0。
    result.extend(_encode_short_parameter(LASER_ON_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(LASER_OFF_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(
        _encode_float_parameter(JUMP_SPEED_ID, initial_jump_speed_inch_s)
    )
    result.extend(
        _encode_float_parameter(MARK_SPEED_ID, initial_mark_speed_inch_s)
    )
    result.extend(_encode_short_parameter(JUMP_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(MARK_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(STEP_PERIOD_ID, FIXED_STEP_PERIOD))

    last_jump_speed_payload = initial_jump_speed_payload
    last_mark_speed_payload = initial_mark_speed_payload

    # chain把已经预读的第一条命令放回迭代序列，同时仍支持生成器等一次性迭代器。
    for command in chain((first_command,), command_iterator):
        if command.kind not in ("jump", "mark"):
            raise ValueError(f"未知运动类型：{command.kind!r}")

        payload = _speed_payload(command.speed_mm_s)
        speed_inch_s = struct.unpack("<f", payload)[0]

        if command.kind == "jump":
            if payload != last_jump_speed_payload:
                result.extend(_encode_float_parameter(JUMP_SPEED_ID, speed_inch_s))
                last_jump_speed_payload = payload
        else:
            if payload != last_mark_speed_payload:
                result.extend(_encode_float_parameter(MARK_SPEED_ID, speed_inch_s))
                last_mark_speed_payload = payload

        result.extend(_encode_motion(command))
    return bytes(result)


def _require_bytes(data: bytes, offset: int, size: int, description: str) -> None:
    """确保记录剩余字节充足，否则报告准确偏移量。"""
    if offset + size > len(data):
        remaining = max(0, len(data) - offset)
        raise DBDFormatError(
            f"偏移0x{offset:08X}处的{description}被截断："
            f"需要{size}字节，只剩{remaining}字节"
        )


def decode_dbd(data: bytes) -> list[MotionCommand]:
    """把DBD二进制命令流解码为运动命令。

    解码器跟踪最近一次JumpSpeed和MarkSpeed，并把当时有效的对应速度附加到
    每条运动命令。延迟和StepPeriod参数会被解析并跳过，不出现在CSV中。

    Args:
        data: 完整DBD文件内容。

    Returns:
        解码后的运动命令列表，坐标为毫米，速度为毫米每秒。

    Raises:
        DBDFormatError: 记录未知、被截断，或运动前没有设置对应速度。
    """
    commands: list[MotionCommand] = []
    jump_speed_mm_s: float | None = None
    mark_speed_mm_s: float | None = None
    offset = 0

    while offset < len(data):
        _require_bytes(data, offset, 2, "命令字")
        opcode = struct.unpack_from("<H", data, offset)[0]

        if opcode == SCAN_PARAMETER_COMMAND:
            _require_bytes(data, offset, 3, "参数记录头")
            parameter_id = data[offset + 2]
            if parameter_id in SHORT_PARAMETER_IDS:
                _require_bytes(data, offset, 5, "uint16参数记录")
                # 虽然CSV不需要这些值，仍完整解包以验证记录边界。
                struct.unpack_from("<H", data, offset + 3)[0]
                offset += 5
                continue
            if parameter_id in FLOAT_PARAMETER_IDS:
                _require_bytes(data, offset, 7, "float32参数记录")
                value_inch_s = struct.unpack_from("<f", data, offset + 3)[0]
                value_mm_s = value_inch_s * MM_PER_INCH
                if not math.isfinite(value_mm_s) or value_mm_s <= 0.0:
                    raise DBDFormatError(
                        f"偏移0x{offset:08X}处的速度不是大于0的有限数"
                    )
                if parameter_id == JUMP_SPEED_ID:
                    jump_speed_mm_s = value_mm_s
                else:
                    mark_speed_mm_s = value_mm_s
                offset += 7
                continue
            raise DBDFormatError(
                f"偏移0x{offset:08X}处存在未知参数ID {parameter_id}，"
                "无法安全确定记录长度"
            )

        if opcode in (JUMP_ABSOLUTE_COMMAND, MARK_ABSOLUTE_COMMAND):
            _require_bytes(data, offset, 10, "运动记录")
            x_inch, y_inch = struct.unpack_from("<ff", data, offset + 2)
            kind = "jump" if opcode == JUMP_ABSOLUTE_COMMAND else "mark"
            speed_mm_s = jump_speed_mm_s if kind == "jump" else mark_speed_mm_s
            if speed_mm_s is None:
                raise DBDFormatError(
                    f"偏移0x{offset:08X}处的{kind}之前没有设置对应速度"
                )
            commands.append(
                MotionCommand(
                    kind=kind,
                    x_mm=x_inch * MM_PER_INCH,
                    y_mm=y_inch * MM_PER_INCH,
                    speed_mm_s=speed_mm_s,
                )
            )
            offset += 10
            continue

        preview = data[offset : offset + 12].hex(" ").upper()
        raise DBDFormatError(
            f"偏移0x{offset:08X}处存在未知命令字0x{opcode:04X}；"
            f"附近字节：{preview}"
        )

    if not commands:
        raise DBDFormatError("DBD中没有任何Jump或Mark运动记录")
    return commands
