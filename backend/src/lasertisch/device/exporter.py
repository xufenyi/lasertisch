"""Map device-independent toolpaths to the target jump/mark file formats."""

from __future__ import annotations

from dataclasses import dataclass

from lasertisch.domain.bridge import ExportFormat, LaserState, ToolpathPlan
from lasertisch.domain.models import PointUm

from .errors import DeviceExportError
from .protocol import MotionCommand, MotionKind, encode_dbd, encode_motion_csv


UM_PER_MM = 1_000


@dataclass(frozen=True, slots=True)
class EncodedProgram:
    content: bytes
    media_type: str
    filename_extension: str
    command_count: int


def _millimetres(value_um: int) -> float:
    return value_um / UM_PER_MM


def _motion_command(
    kind: MotionKind, target: PointUm, speed_um_per_sec: int
) -> MotionCommand:
    return MotionCommand(
        kind=kind,
        x_mm=_millimetres(target.x_um),
        y_mm=_millimetres(target.y_um),
        speed_mm_s=_millimetres(speed_um_per_sec),
    )


def motion_commands_for_plan(plan: ToolpathPlan) -> list[MotionCommand]:
    """Produce one absolute device command per preamble/trajectory segment.

    The first jump remains explicit because the device's initial position is unknown.
    Each later command targets the corresponding segment end; ``mark`` therefore
    applies while moving from the previous command point to this command point.
    """

    preamble = plan.preamble[0]
    commands = [_motion_command("jump", preamble.end, preamble.speed_um_per_sec)]
    current = preamble.end
    expected_sequence = 0

    for task in plan.tasks:
        for segment in task.segments:
            if segment.task_id != task.task_id:
                raise DeviceExportError(
                    "device.task_mismatch", sequence=segment.sequence
                )
            if segment.sequence != expected_sequence:
                raise DeviceExportError(
                    "device.invalid_sequence",
                    expected=expected_sequence,
                    actual=segment.sequence,
                )
            if segment.start != current:
                raise DeviceExportError(
                    "device.discontinuous_toolpath", sequence=segment.sequence
                )

            kind = "jump" if segment.laser is LaserState.OFF else "mark"
            commands.append(_motion_command(kind, segment.end, segment.speed_um_per_sec))
            current = segment.end
            expected_sequence += 1

    return commands


def export_toolpath(plan: ToolpathPlan, export_format: ExportFormat) -> EncodedProgram:
    commands = motion_commands_for_plan(plan)
    if export_format is ExportFormat.CSV:
        return EncodedProgram(
            content=encode_motion_csv(commands),
            media_type="text/csv;charset=utf-8",
            filename_extension="csv",
            command_count=len(commands),
        )
    return EncodedProgram(
        content=encode_dbd(commands),
        media_type="application/octet-stream",
        filename_extension="dbd",
        command_count=len(commands),
    )
