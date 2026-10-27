from uuid import UUID

from lasertisch.cam.contours import contour_paths
from lasertisch.domain.models import (
    ContourDirection,
    PointUm,
    PolygonEntity,
    PolygonPart,
)
from lasertisch.geometry import closed_entity_to_geometry


ENTITY_ID = UUID("30000000-0000-0000-0000-000000000001")


def signed_double_area(closed_path: list[PointUm]) -> int:
    return sum(
        first.x_um * second.y_um - second.x_um * first.y_um
        for first, second in zip(closed_path, closed_path[1:])
    )


def holed_square() -> PolygonEntity:
    return PolygonEntity(
        id=ENTITY_ID,
        name="Holed square",
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


def test_exterior_and_hole_are_both_explicitly_closed_clockwise() -> None:
    paths = contour_paths(
        closed_entity_to_geometry(holed_square()),
        ContourDirection.CLOCKWISE,
        PointUm(x_um=0, y_um=0),
    )

    assert len(paths) == 2
    assert all(path[0] == path[-1] for path in paths)
    assert all(len(path) == 5 for path in paths)
    assert all(signed_double_area(path) < 0 for path in paths)


def test_counterclockwise_applies_to_exterior_and_hole() -> None:
    paths = contour_paths(
        closed_entity_to_geometry(holed_square()),
        ContourDirection.COUNTERCLOCKWISE,
        PointUm(x_um=0, y_um=0),
    )

    assert all(signed_double_area(path) > 0 for path in paths)


def test_contour_starts_at_nearest_available_vertex() -> None:
    paths = contour_paths(
        closed_entity_to_geometry(holed_square()),
        ContourDirection.CLOCKWISE,
        PointUm(x_um=4_900, y_um=4_900),
    )

    assert paths[0][0] == PointUm(x_um=5_000, y_um=5_000)

