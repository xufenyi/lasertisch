"""Ordered region booleans on the same micron grid used for machining."""

from uuid import UUID, uuid4

from shapely import difference, intersection, union
from shapely.geometry import GeometryCollection, MultiPolygon, Polygon
from shapely.geometry.base import BaseGeometry

from lasertisch.domain.bridge import BooleanOperation
from lasertisch.domain.models import LineEntity, PointUm, PolygonEntity, PolygonPart, ProjectDocument
from .conversion import closed_entity_to_geometry
from .errors import GeometryContractError
from .precision import GRID_SIZE_MM, coordinate_to_point_um, mm_to_um, snap_geometry


def _area_parts(geometry: BaseGeometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [] if geometry.is_empty else [geometry]
    if isinstance(geometry, (MultiPolygon, GeometryCollection)):
        return [part for child in geometry.geoms for part in _area_parts(child)]
    return []  # Point/line contacts are not closed regions.


def boolean_document(
    document: ProjectDocument, operation: BooleanOperation, operand_a_id: UUID, operand_b_id: UUID,
) -> PolygonEntity | None:
    if operand_a_id == operand_b_id:
        raise GeometryContractError("boolean.distinct_operands_required")
    by_id = {entity.id: entity for entity in document.entities}
    a, b = by_id.get(operand_a_id), by_id.get(operand_b_id)
    if a is None or b is None:
        raise GeometryContractError("boolean.operand_not_found")
    if isinstance(a, LineEntity) or isinstance(b, LineEntity):
        raise GeometryContractError("boolean.closed_shapes_required")
    if a.locked or b.locked or not a.visible or not b.visible:
        raise GeometryContractError("boolean.operands_unavailable")

    operations = {BooleanOperation.UNION: union, BooleanOperation.INTERSECTION: intersection,
                  BooleanOperation.DIFFERENCE: difference}
    geometry = operations[operation](closed_entity_to_geometry(a), closed_entity_to_geometry(b), grid_size=GRID_SIZE_MM)
    polygons = _area_parts(geometry)
    if not polygons:
        return None
    snapped = snap_geometry(polygons[0] if len(polygons) == 1 else MultiPolygon(polygons)).normalize()
    polygons = _area_parts(snapped)
    if not polygons:
        return None
    min_x, min_y, max_x, max_y = snapped.bounds
    x = (mm_to_um(min_x) + mm_to_um(max_x) + 1) // 2
    y = (mm_to_um(min_y) + mm_to_um(max_y) + 1) // 2

    def local_ring(ring) -> list[PointUm]:
        points = [coordinate_to_point_um((px, py)) for px, py in list(ring.coords)[:-1]]
        return [PointUm(x_um=point.x_um - x, y_um=point.y_um - y) for point in points]

    result = PolygonEntity(
        id=uuid4(), name="Boolean result", process=a.process.model_copy(deep=True),
        position=PointUm(x_um=x, y_um=y), rotation_tenths_deg=0,
        parts=[PolygonPart(outer_ring=local_ring(polygon.exterior),
                           holes=[local_ring(ring) for ring in polygon.interiors]) for polygon in polygons],
    )
    closed_entity_to_geometry(result)
    ProjectDocument.model_validate({
        **document.model_dump(mode="json", by_alias=True),
        "entities": [result.model_dump(mode="json", by_alias=True)],
        "processingOrder": [str(result.id)],
    })
    return result
