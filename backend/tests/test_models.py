from uuid import UUID

import pytest
from pydantic import ValidationError

from lasertisch.domain.models import (
    LineEntity,
    PointUm,
    PolygonEntity,
    PolygonPart,
    ProcessSpec,
    ProjectDocument,
    RectangleEntity,
    WorkArea,
)


DOCUMENT_ID = UUID("00000000-0000-0000-0000-000000000001")
RECTANGLE_ID = UUID("00000000-0000-0000-0000-000000000002")
LINE_ID = UUID("00000000-0000-0000-0000-000000000003")


def make_rectangle() -> RectangleEntity:
    return RectangleEntity(
        id=RECTANGLE_ID,
        name="Rectangle 1",
        center=PointUm(x_um=12_345, y_um=-4_567),
        width_um=20_001,
        height_um=10_000,
        rotation_tenths_deg=3611,
        process=ProcessSpec(fill_angle_tenths_deg=-1),
    )


def make_line() -> LineEntity:
    return LineEntity(
        id=LINE_ID,
        name="Line 1",
        start=PointUm(x_um=-1_000, y_um=0),
        end=PointUm(x_um=1_000, y_um=0),
    )


def test_default_process_uses_point_zero_eight_mm_hatch_spacing() -> None:
    assert ProcessSpec().hatch_spacing_um == 80


def test_project_round_trip_preserves_integer_micrometres() -> None:
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Precision fixture",
        entities=[make_rectangle(), make_line()],
        processing_order=[RECTANGLE_ID, LINE_ID],
    )

    payload = document.model_dump_json(by_alias=True)
    restored = ProjectDocument.model_validate_json(payload)

    rectangle = restored.entities[0]
    assert isinstance(rectangle, RectangleEntity)
    assert rectangle.center.x_um == 12_345
    assert rectangle.center.y_um == -4_567
    assert rectangle.width_um == 20_001
    assert rectangle.rotation_tenths_deg == 11
    assert rectangle.process.fill_angle_tenths_deg == 3599
    assert restored == document


def test_processing_order_must_contain_each_entity_exactly_once() -> None:
    with pytest.raises(ValidationError, match="every entity id exactly once"):
        ProjectDocument(
            document_id=DOCUMENT_ID,
            project_name="Invalid order",
            entities=[make_rectangle(), make_line()],
            processing_order=[RECTANGLE_ID],
        )


def test_rotated_rectangle_must_remain_inside_configured_work_area() -> None:
    rectangle = RectangleEntity(
        id=RECTANGLE_ID,
        name="Outside",
        center=PointUm(x_um=90_000, y_um=0),
        width_um=20_000,
        height_um=20_000,
        rotation_tenths_deg=450,
    )
    with pytest.raises(ValidationError, match="outside the configured work area"):
        ProjectDocument(
            document_id=DOCUMENT_ID,
            project_name="Outside",
            entities=[rectangle],
            processing_order=[RECTANGLE_ID],
        )


def test_work_area_size_and_world_position_are_configurable() -> None:
    rectangle = RectangleEntity(
        id=RECTANGLE_ID,
        name="Translated work area",
        center=PointUm(x_um=500_000, y_um=-250_000),
        width_um=20_000,
        height_um=10_000,
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Translated",
        work_area=WorkArea(
            width_um=100_000,
            height_um=80_000,
            center=PointUm(x_um=500_000, y_um=-250_000),
        ),
        entities=[rectangle],
        processing_order=[RECTANGLE_ID],
    )

    assert document.work_area.center == PointUm(x_um=500_000, y_um=-250_000)


def test_zero_length_line_is_rejected() -> None:
    with pytest.raises(ValidationError, match="endpoints must be different"):
        LineEntity(
            id=LINE_ID,
            name="Zero",
            start=PointUm(x_um=0, y_um=0),
            end=PointUm(x_um=0, y_um=0),
        )


def test_polygon_rings_omit_the_repeated_closing_vertex() -> None:
    points = [
        PointUm(x_um=0, y_um=0),
        PointUm(x_um=1_000, y_um=0),
        PointUm(x_um=0, y_um=1_000),
        PointUm(x_um=0, y_um=0),
    ]
    with pytest.raises(ValidationError, match="omit the duplicated"):
        PolygonEntity(
            id=RECTANGLE_ID,
            name="Closed twice",
            parts=[PolygonPart(outer_ring=points)],
        )

