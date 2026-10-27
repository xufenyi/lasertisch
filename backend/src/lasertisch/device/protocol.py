"""Encode target-device absolute jump/mark programs as CSV or DBD."""

from __future__ import annotations

import csv
from dataclasses import dataclass
import io
from itertools import chain
import math
import struct
from typing import Iterable, Literal


MotionKind = Literal["jump", "mark"]


@dataclass(frozen=True, slots=True)
class MotionCommand:
    kind: MotionKind
    x_mm: float
    y_mm: float
    speed_mm_s: float


MM_PER_INCH = 25.4
SCAN_PARAMETER_COMMAND = 0x4943
MARK_ABSOLUTE_COMMAND = 0x4C4F
JUMP_ABSOLUTE_COMMAND = 0x4D41
LASER_ON_DELAY_ID = 0
LASER_OFF_DELAY_ID = 1
JUMP_SPEED_ID = 2
MARK_SPEED_ID = 3
JUMP_DELAY_ID = 4
MARK_DELAY_ID = 5
STEP_PERIOD_ID = 6
FIXED_DELAY_VALUE = 0
FIXED_STEP_PERIOD = 100
DEFAULT_JUMP_SPEED_MM_S = 7000.0
DEFAULT_MARK_SPEED_MM_S = 1000.0


def _format_decimal(value: float) -> str:
    nearest_integer = round(value)
    tolerance = max(1e-6, abs(value) * 6e-8)
    if math.isclose(value, nearest_integer, rel_tol=0.0, abs_tol=tolerance):
        return str(nearest_integer)
    return f"{value:.9f}".rstrip("0").rstrip(".")


def encode_motion_csv(commands: Iterable[MotionCommand]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(("command", "x", "y", "speed"))
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


def _encode_short_parameter(parameter_id: int, value: int) -> bytes:
    if not 0 <= value <= 0xFFFF:
        raise ValueError(f"uint16 parameter is out of range: {value}")
    return struct.pack("<HBH", SCAN_PARAMETER_COMMAND, parameter_id, value)


def _encode_float_parameter(parameter_id: int, value: float) -> bytes:
    if not math.isfinite(value):
        raise ValueError(f"parameter must be finite: {value}")
    return struct.pack("<HBf", SCAN_PARAMETER_COMMAND, parameter_id, value)


def _speed_payload(speed_mm_s: float) -> bytes:
    if not math.isfinite(speed_mm_s) or speed_mm_s <= 0.0:
        raise ValueError(f"speed must be finite and positive: {speed_mm_s}")
    try:
        return struct.pack("<f", speed_mm_s / MM_PER_INCH)
    except OverflowError as error:
        raise ValueError(f"speed exceeds float32 range: {speed_mm_s}") from error


def _encode_motion(command: MotionCommand) -> bytes:
    if command.kind not in ("jump", "mark"):
        raise ValueError(f"unknown motion kind: {command.kind!r}")
    if not math.isfinite(command.x_mm) or not math.isfinite(command.y_mm):
        raise ValueError("coordinates must be finite")
    opcode = JUMP_ABSOLUTE_COMMAND if command.kind == "jump" else MARK_ABSOLUTE_COMMAND
    try:
        return struct.pack(
            "<Hff", opcode, command.x_mm / MM_PER_INCH, command.y_mm / MM_PER_INCH
        )
    except OverflowError as error:
        raise ValueError(
            f"coordinates exceed float32 range: ({command.x_mm}, {command.y_mm})"
        ) from error


def encode_dbd(commands: Iterable[MotionCommand]) -> bytes:
    iterator = iter(commands)
    try:
        first = next(iterator)
    except StopIteration as error:
        raise ValueError("cannot encode an empty DBD program") from error
    if first.kind not in ("jump", "mark"):
        raise ValueError(f"unknown motion kind: {first.kind!r}")

    initial_jump = _speed_payload(DEFAULT_JUMP_SPEED_MM_S)
    initial_mark = _speed_payload(DEFAULT_MARK_SPEED_MM_S)
    first_speed = _speed_payload(first.speed_mm_s)
    if first.kind == "jump":
        initial_jump = first_speed
    else:
        initial_mark = first_speed

    result = bytearray()
    result.extend(_encode_short_parameter(LASER_ON_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(LASER_OFF_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(
        _encode_float_parameter(JUMP_SPEED_ID, struct.unpack("<f", initial_jump)[0])
    )
    result.extend(
        _encode_float_parameter(MARK_SPEED_ID, struct.unpack("<f", initial_mark)[0])
    )
    result.extend(_encode_short_parameter(JUMP_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(MARK_DELAY_ID, FIXED_DELAY_VALUE))
    result.extend(_encode_short_parameter(STEP_PERIOD_ID, FIXED_STEP_PERIOD))

    last_jump = initial_jump
    last_mark = initial_mark
    for command in chain((first,), iterator):
        payload = _speed_payload(command.speed_mm_s)
        speed_inch_s = struct.unpack("<f", payload)[0]
        if command.kind == "jump" and payload != last_jump:
            result.extend(_encode_float_parameter(JUMP_SPEED_ID, speed_inch_s))
            last_jump = payload
        elif command.kind == "mark" and payload != last_mark:
            result.extend(_encode_float_parameter(MARK_SPEED_ID, speed_inch_s))
            last_mark = payload
        result.extend(_encode_motion(command))
    return bytes(result)
