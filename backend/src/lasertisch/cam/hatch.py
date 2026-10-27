"""World-anchored parallel scanline generation with serpentine traversal."""

from __future__ import annotations

from dataclasses import dataclass
import math

from shapely import intersection
from shapely.geometry import GeometryCollection, LineString, MultiLineString
from shapely.geometry.base import BaseGeometry

from lasertisch.domain.models import PointUm
from lasertisch.geometry.conversion import ClosedGeometry
from lasertisch.geometry.precision import GRID_SIZE_MM, coordinate_to_point_um, um_to_mm


@dataclass(frozen=True, slots=True)
class HatchSegment:
    row_index: int
    start: PointUm
    end: PointUm


def _line_components(geometry: BaseGeometry) -> list[LineString]:
    if geometry.is_empty:
        return []
    if isinstance(geometry, LineString):
        return [geometry]
    if isinstance(geometry, (MultiLineString, GeometryCollection)):
        result: list[LineString] = []
        for part in geometry.geoms:
            result.extend(_line_components(part))
        return result
    return []


def _projection(point: PointUm, direction_x: float, direction_y: float) -> float:
    return point.x_um * direction_x + point.y_um * direction_y


def _quantized_component_endpoints(
    component: LineString,
    direction_x: float,
    direction_y: float,
) -> tuple[PointUm, PointUm] | None:
    points = {
        (point.x_um, point.y_um): point
        for point in (
            coordinate_to_point_um((x, y)) for x, y in component.coords
        )
    }
    if len(points) < 2:
        return None
    ordered = sorted(
        points.values(),
        key=lambda point: (
            _projection(point, direction_x, direction_y),
            point.x_um,
            point.y_um,
        ),
    )
    return ordered[0], ordered[-1]


def _is_long_enough(start: PointUm, end: PointUm, minimum_length_um: int) -> bool:
    return math.hypot(end.x_um - start.x_um, end.y_um - start.y_um) >= (
        minimum_length_um - 1e-9
    )


def hatch_segments(
    geometry: ClosedGeometry,
    angle_tenths_deg: int,
    spacing_um: int,
    minimum_length_um: int,
) -> list[HatchSegment]:
    """Intersect a region with a world-origin-anchored serpentine scanline family."""

    angle_radians = math.radians(-angle_tenths_deg / 10)
    direction_x = math.cos(angle_radians)
    direction_y = math.sin(angle_radians)
    normal_x = -direction_y
    normal_y = direction_x
    spacing_mm = um_to_mm(spacing_um)

    min_x, min_y, max_x, max_y = geometry.bounds
    bounds = (
        (min_x, min_y),
        (min_x, max_y),
        (max_x, min_y),
        (max_x, max_y),
    )
    normal_projections = [x * normal_x + y * normal_y for x, y in bounds]
    direction_projections = [x * direction_x + y * direction_y for x, y in bounds]

    tolerance = GRID_SIZE_MM * 1e-6
    first_index = math.ceil((min(normal_projections) - tolerance) / spacing_mm)
    last_index = math.floor((max(normal_projections) + tolerance) / spacing_mm)
    extension = math.hypot(max_x - min_x, max_y - min_y) + spacing_mm
    line_min = min(direction_projections) - extension
    line_max = max(direction_projections) + extension

    result: list[HatchSegment] = []
    emitted_row_index = 0
    for scan_index in range(first_index, last_index + 1):
        normal_offset = scan_index * spacing_mm
        scanline = LineString(
            [
                (
                    normal_x * normal_offset + direction_x * line_min,
                    normal_y * normal_offset + direction_y * line_min,
                ),
                (
                    normal_x * normal_offset + direction_x * line_max,
                    normal_y * normal_offset + direction_y * line_max,
                ),
            ]
        )
        clipped = intersection(geometry, scanline, grid_size=GRID_SIZE_MM)

        unique: dict[tuple[int, int, int, int], tuple[PointUm, PointUm]] = {}
        for component in _line_components(clipped):
            endpoints = _quantized_component_endpoints(
                component, direction_x, direction_y
            )
            if endpoints is None:
                continue
            start, end = endpoints
            if not _is_long_enough(start, end, minimum_length_um):
                continue
            key = (start.x_um, start.y_um, end.x_um, end.y_um)
            unique[key] = (start, end)

        row_segments = sorted(
            unique.values(),
            key=lambda endpoints: _projection(
                endpoints[0], direction_x, direction_y
            ),
        )
        if not row_segments:
            continue

        if emitted_row_index % 2:
            row_segments = [(end, start) for start, end in reversed(row_segments)]
        result.extend(
            HatchSegment(emitted_row_index, start, end)
            for start, end in row_segments
        )
        emitted_row_index += 1
    return result

