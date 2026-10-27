"""Deterministic closed contour extraction and traversal."""

from __future__ import annotations

from collections.abc import Iterable

from shapely.geometry import LinearRing, MultiPolygon, Polygon

from lasertisch.domain.models import ContourDirection, PointUm
from lasertisch.geometry.conversion import ClosedGeometry
from lasertisch.geometry.errors import GeometryContractError
from lasertisch.geometry.precision import (
    coordinate_to_point_um,
    remove_consecutive_duplicate_points,
)


def _signed_double_area(points: list[PointUm]) -> int:
    return sum(
        first.x_um * second.y_um - second.x_um * first.y_um
        for first, second in zip(points, points[1:] + points[:1], strict=True)
    )


def _quantized_ring(ring: LinearRing) -> list[PointUm]:
    coordinates = list(ring.coords)
    if coordinates and coordinates[0] == coordinates[-1]:
        coordinates.pop()
    points = remove_consecutive_duplicate_points(
        coordinate_to_point_um((x, y)) for x, y in coordinates
    )
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    if len(points) < 3 or _signed_double_area(points) == 0:
        raise GeometryContractError("geometry.degenerate_quantized_ring")
    return points


def _apply_direction(
    points: list[PointUm], direction: ContourDirection
) -> list[PointUm]:
    is_clockwise = _signed_double_area(points) < 0
    wants_clockwise = direction is ContourDirection.CLOCKWISE
    return points if is_clockwise == wants_clockwise else list(reversed(points))


def _rotate_to_nearest_vertex(
    points: list[PointUm], current: PointUm
) -> list[PointUm]:
    start_index = min(
        range(len(points)),
        key=lambda index: (
            (points[index].x_um - current.x_um) ** 2
            + (points[index].y_um - current.y_um) ** 2,
            index,
        ),
    )
    return points[start_index:] + points[:start_index]


def _polygons(geometry: ClosedGeometry) -> Iterable[Polygon]:
    if isinstance(geometry, Polygon):
        yield geometry
    elif isinstance(geometry, MultiPolygon):
        yield from geometry.geoms


def contour_paths(
    geometry: ClosedGeometry,
    direction: ContourDirection,
    current: PointUm,
) -> list[list[PointUm]]:
    """Return exterior-then-hole paths, each with an explicit closing endpoint."""

    paths: list[list[PointUm]] = []
    next_current = current
    for polygon in _polygons(geometry):
        for ring in (polygon.exterior, *polygon.interiors):
            points = _apply_direction(_quantized_ring(ring), direction)
            points = _rotate_to_nearest_vertex(points, next_current)
            closed = points + [points[0]]
            paths.append(closed)
            next_current = points[0]
    return paths

