"""Convert canonical entities into precision-controlled Shapely geometries."""

from __future__ import annotations

import math

from shapely import is_valid, is_valid_reason
from shapely.geometry import LineString, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry
from shapely.errors import GEOSException

from lasertisch.domain.models import (
    Entity,
    LineEntity,
    PolygonEntity,
    RectangleEntity,
)

from .errors import GeometryContractError
from .precision import snap_geometry, um_to_mm


ClosedGeometry = Polygon | MultiPolygon


def _rectangle_to_polygon(entity: RectangleEntity) -> Polygon:
    half_width = um_to_mm(entity.width_um) / 2
    half_height = um_to_mm(entity.height_um) / 2
    center_x = um_to_mm(entity.center.x_um)
    center_y = um_to_mm(entity.center.y_um)
    angle = math.radians(-entity.rotation_tenths_deg / 10)
    cos_angle = math.cos(angle)
    sin_angle = math.sin(angle)

    coordinates: list[tuple[float, float]] = []
    for local_x, local_y in (
        (-half_width, -half_height),
        (half_width, -half_height),
        (half_width, half_height),
        (-half_width, half_height),
    ):
        coordinates.append(
            (
                center_x + local_x * cos_angle - local_y * sin_angle,
                center_y + local_x * sin_angle + local_y * cos_angle,
            )
        )
    return Polygon(coordinates)


def _polygon_entity_to_geometry(entity: PolygonEntity) -> ClosedGeometry:
    polygons = [
        Polygon(
            [(um_to_mm(point.x_um), um_to_mm(point.y_um)) for point in part.outer_ring],
            [
                [(um_to_mm(point.x_um), um_to_mm(point.y_um)) for point in hole]
                for hole in part.holes
            ],
        )
        for part in entity.parts
    ]
    if len(polygons) == 1:
        return polygons[0]
    return MultiPolygon(polygons)


def _validate_closed_geometry(
    geometry: ClosedGeometry, entity: RectangleEntity | PolygonEntity
) -> ClosedGeometry:
    if geometry.is_empty:
        raise GeometryContractError("geometry.empty", entityId=str(entity.id))
    if not is_valid(geometry):
        raise GeometryContractError(
            "geometry.invalid",
            entityId=str(entity.id),
            reason=is_valid_reason(geometry),
        )
    try:
        snapped = snap_geometry(geometry)
    except GEOSException as exc:
        raise GeometryContractError(
            "geometry.precision_reduction_failed",
            entityId=str(entity.id),
            reason=str(exc),
        ) from exc
    if snapped.is_empty:
        raise GeometryContractError(
            "geometry.disappeared_at_micron_precision", entityId=str(entity.id)
        )
    if not isinstance(snapped, (Polygon, MultiPolygon)) or not is_valid(snapped):
        raise GeometryContractError(
            "geometry.invalid_after_precision_reduction",
            entityId=str(entity.id),
            reason=is_valid_reason(snapped),
        )
    return snapped


def closed_entity_to_geometry(
    entity: RectangleEntity | PolygonEntity,
) -> ClosedGeometry:
    raw = (
        _rectangle_to_polygon(entity)
        if isinstance(entity, RectangleEntity)
        else _polygon_entity_to_geometry(entity)
    )
    return _validate_closed_geometry(raw, entity)


def entity_to_geometry(entity: Entity) -> BaseGeometry:
    if isinstance(entity, LineEntity):
        return LineString(
            [
                (um_to_mm(entity.start.x_um), um_to_mm(entity.start.y_um)),
                (um_to_mm(entity.end.x_um), um_to_mm(entity.end.y_um)),
            ]
        )
    return closed_entity_to_geometry(entity)

