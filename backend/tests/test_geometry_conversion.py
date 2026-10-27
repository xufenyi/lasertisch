from uuid import UUID

import pytest

from lasertisch.domain.models import (
    LineEntity,
    PointUm,
    PolygonEntity,
    PolygonPart,
    ProcessMode,
    ProcessSpec,
    RectangleEntity,
)
from lasertisch.geometry import GeometryContractError, closed_entity_to_geometry


ENTITY_ID = UUID("10000000-0000-0000-0000-000000000001")


def test_rotated_rectangle_uses_its_center_and_clockwise_degrees() -> None:
    rectangle = RectangleEntity(
        id=ENTITY_ID,
        name="Rotated",
        center=PointUm(x_um=0, y_um=0),
        width_um=20_000,
        height_um=10_000,
        rotation_tenths_deg=900,
    )

    geometry = closed_entity_to_geometry(rectangle)

    assert geometry.area == pytest.approx(200.0)
    assert geometry.bounds == pytest.approx((-5.0, -10.0, 5.0, 10.0))


def test_polygon_entity_preserves_holes_and_disconnected_parts() -> None:
    polygon = PolygonEntity(
        id=ENTITY_ID,
        name="Two parts with a hole",
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-10_000, y_um=-10_000),
                    PointUm(x_um=10_000, y_um=-10_000),
                    PointUm(x_um=10_000, y_um=10_000),
                    PointUm(x_um=-10_000, y_um=10_000),
                ],
                holes=[
                    [
                        PointUm(x_um=-2_000, y_um=-2_000),
                        PointUm(x_um=2_000, y_um=-2_000),
                        PointUm(x_um=2_000, y_um=2_000),
                        PointUm(x_um=-2_000, y_um=2_000),
                    ]
                ],
            ),
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=20_000, y_um=0),
                    PointUm(x_um=30_000, y_um=0),
                    PointUm(x_um=30_000, y_um=10_000),
                    PointUm(x_um=20_000, y_um=10_000),
                ]
            ),
        ],
    )

    geometry = closed_entity_to_geometry(polygon)

    assert geometry.geom_type == "MultiPolygon"
    assert geometry.area == pytest.approx(484.0)


def test_self_intersecting_polygon_is_rejected_not_silently_repaired() -> None:
    polygon = PolygonEntity(
        id=ENTITY_ID,
        name="Bow tie",
        parts=[
            PolygonPart(
                outer_ring=[
                    PointUm(x_um=-1_000, y_um=-1_000),
                    PointUm(x_um=1_000, y_um=1_000),
                    PointUm(x_um=-1_000, y_um=1_000),
                    PointUm(x_um=1_000, y_um=-1_000),
                ]
            )
        ],
    )

    with pytest.raises(GeometryContractError) as error:
        closed_entity_to_geometry(polygon)

    assert error.value.code == "geometry.invalid"


def test_open_line_rejects_fill_process_mode() -> None:
    with pytest.raises(ValueError, match="only none or contour"):
        LineEntity(
            id=ENTITY_ID,
            name="Invalid fill line",
            start=PointUm(x_um=0, y_um=0),
            end=PointUm(x_um=1_000, y_um=0),
            process=ProcessSpec(mode=ProcessMode.FILL),
        )

