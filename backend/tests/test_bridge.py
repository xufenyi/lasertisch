from uuid import UUID

import pytest
from pydantic import ValidationError

from lasertisch.domain.bridge import InitialJump, LaserState, MotionSegment, SegmentKind
from lasertisch.domain.models import PointUm


ENTITY_ID = UUID("00000000-0000-0000-0000-000000000002")
TASK_ID = UUID("00000000-0000-0000-0000-000000000010")


def test_initial_jump_has_unknown_start_and_targets_origin() -> None:
    jump = InitialJump(speed_um_per_sec=10_000_000)

    assert jump.start is None
    assert jump.end == PointUm(x_um=0, y_um=0)
    assert jump.laser is LaserState.OFF


def test_initial_jump_to_any_other_point_is_rejected() -> None:
    with pytest.raises(ValidationError, match="world origin"):
        InitialJump(
            end=PointUm(x_um=1, y_um=0),
            speed_um_per_sec=10_000_000,
        )


def test_mark_segment_requires_explicit_laser_on() -> None:
    with pytest.raises(ValidationError, match="requires laser=on"):
        MotionSegment(
            sequence=0,
            kind=SegmentKind.HATCH,
            laser=LaserState.OFF,
            start=PointUm(x_um=0, y_um=0),
            end=PointUm(x_um=100, y_um=0),
            speed_um_per_sec=900_000,
            source_entity_ids=[ENTITY_ID],
            task_id=TASK_ID,
        )


def test_travel_segment_requires_explicit_laser_off() -> None:
    segment = MotionSegment(
        sequence=0,
        kind=SegmentKind.TRAVEL,
        laser=LaserState.OFF,
        start=PointUm(x_um=0, y_um=0),
        end=PointUm(x_um=100, y_um=0),
        speed_um_per_sec=10_000_000,
        source_entity_ids=[ENTITY_ID],
        task_id=TASK_ID,
    )

    assert segment.laser is LaserState.OFF

