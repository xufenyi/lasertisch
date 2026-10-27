from uuid import UUID

from lasertisch.cam import plan_document
from lasertisch.domain.bridge import LaserState, SegmentKind
from lasertisch.domain.models import (
    LineEntity,
    PointUm,
    PolygonEntity,
    PolygonPart,
    ProcessMode,
    ProcessSpec,
    ProjectDocument,
    RectangleEntity,
)


DOCUMENT_ID = UUID("40000000-0000-0000-0000-000000000001")
FIRST_ID = UUID("40000000-0000-0000-0000-000000000002")
SECOND_ID = UUID("40000000-0000-0000-0000-000000000003")
PLAN_ID = UUID("40000000-0000-0000-0000-000000000004")


def test_initial_jump_line_direction_and_object_order_are_explicit() -> None:
    first = LineEntity(
        id=FIRST_ID,
        name="First",
        start=PointUm(x_um=10_000, y_um=0),
        end=PointUm(x_um=20_000, y_um=0),
    )
    second = LineEntity(
        id=SECOND_ID,
        name="Second",
        start=PointUm(x_um=-10_000, y_um=0),
        end=PointUm(x_um=-20_000, y_um=0),
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Order",
        entities=[second, first],
        processing_order=[FIRST_ID, SECOND_ID],
    )

    plan = plan_document(document, 7, plan_id=PLAN_ID)

    assert plan.input_revision == 7
    assert plan.preamble[0].start is None
    assert plan.preamble[0].end == PointUm(x_um=0, y_um=0)
    assert [task.source_entity_ids[0] for task in plan.tasks] == [FIRST_ID, SECOND_ID]
    first_marks = [
        segment
        for segment in plan.tasks[0].segments
        if segment.kind is SegmentKind.OPEN_LINE
    ]
    assert len(first_marks) == 1
    assert first_marks[0].start == first.start
    assert first_marks[0].end == first.end
    assert plan.tasks[0].segments[0].kind is SegmentKind.TRAVEL
    assert plan.tasks[0].segments[0].laser is LaserState.OFF


def test_hole_gap_is_an_explicit_laser_off_travel() -> None:
    polygon = PolygonEntity(
        id=FIRST_ID,
        name="Holed fill",
        process=ProcessSpec(
            mode=ProcessMode.FILL,
            hatch_spacing_um=1_000,
            fill_angle_tenths_deg=0,
        ),
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-5_000, y_um=-5_000),
                    PointUm(x_um=5_000, y_um=-5_000),
                    PointUm(x_um=5_000, y_um=5_000),
                    PointUm(x_um=-5_000, y_um=5_000),
                ],
                holes=[
                    [
                        PointUm(x_um=-1_000, y_um=-1_000),
                        PointUm(x_um=1_000, y_um=-1_000),
                        PointUm(x_um=1_000, y_um=1_000),
                        PointUm(x_um=-1_000, y_um=1_000),
                    ]
                ],
            )
        ],
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Hole",
        entities=[polygon],
        processing_order=[FIRST_ID],
    )

    plan = plan_document(document, 1, plan_id=PLAN_ID)
    gap_travels = [
        segment
        for segment in plan.tasks[0].segments
        if segment.kind is SegmentKind.TRAVEL
        and segment.start.y_um == 0
        and segment.end.y_um == 0
        and {segment.start.x_um, segment.end.x_um} == {-1_000, 1_000}
    ]

    assert len(gap_travels) == 1
    assert gap_travels[0].laser is LaserState.OFF


def test_fill_then_contour_preserves_mode_order() -> None:
    rectangle = RectangleEntity(
        id=FIRST_ID,
        name="Combined",
        center=PointUm(x_um=0, y_um=0),
        width_um=2_000,
        height_um=2_000,
        process=ProcessSpec(
            mode=ProcessMode.FILL_THEN_CONTOUR,
            hatch_spacing_um=1_000,
        ),
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Combined",
        entities=[rectangle],
        processing_order=[FIRST_ID],
    )

    plan = plan_document(document, 1, plan_id=PLAN_ID)
    mark_kinds = [
        segment.kind
        for segment in plan.tasks[0].segments
        if segment.laser is LaserState.ON
    ]

    first_contour = mark_kinds.index(SegmentKind.CONTOUR)
    assert all(kind is SegmentKind.HATCH for kind in mark_kinds[:first_contour])
    assert all(kind is SegmentKind.CONTOUR for kind in mark_kinds[first_contour:])


def test_none_mode_is_kept_in_document_but_omitted_from_plan() -> None:
    reference = RectangleEntity(
        id=FIRST_ID,
        name="Reference",
        center=PointUm(x_um=0, y_um=0),
        width_um=1_000,
        height_um=1_000,
        process=ProcessSpec(mode=ProcessMode.NONE),
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Reference",
        entities=[reference],
        processing_order=[FIRST_ID],
    )

    plan = plan_document(document, 0, plan_id=PLAN_ID)

    assert plan.tasks == []

