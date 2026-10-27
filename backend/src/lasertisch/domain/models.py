"""Version 2 canonical project document models with version 1 migration.

Fabric.js objects and Shapely geometries are projections of these models. They are
never persisted as the authoritative project representation.
"""

from __future__ import annotations

import math
from copy import deepcopy
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PositiveInt, field_validator, model_validator

from .common import ContractModel
from .units import normalize_tenths_degrees


WORK_AREA_SIZE_UM = 190_000
DEFAULT_TRAVEL_SPEED_UM_PER_SEC = 10_000_000
MINIMUM_MARK_SEGMENT_UM = 100
DEFAULT_ELLIPSE_SIDES = 64
MAX_ELLIPSE_SIDES = 1024

CoordinateUm = int
AngleTenthsDeg = Annotated[int, Field(ge=0, lt=3600)]


class ProcessMode(StrEnum):
    NONE = "none"
    CONTOUR = "contour"
    FILL = "fill"
    FILL_THEN_CONTOUR = "fill_then_contour"
    CONTOUR_THEN_FILL = "contour_then_fill"


class ContourDirection(StrEnum):
    CLOCKWISE = "clockwise"
    COUNTERCLOCKWISE = "counterclockwise"


class PointUm(ContractModel):
    x_um: CoordinateUm
    y_um: CoordinateUm


class WorkArea(ContractModel):
    width_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)] = WORK_AREA_SIZE_UM
    height_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)] = WORK_AREA_SIZE_UM
    center: PointUm = Field(default_factory=lambda: PointUm(x_um=0, y_um=0))
    origin: Literal["center"] = "center"


class GridSettings(ContractModel):
    visible: bool = True
    spacing_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)] = 5_000
    snap_move: bool = True
    snap_resize: bool = True


class ProcessSpec(ContractModel):
    mode: ProcessMode = ProcessMode.CONTOUR
    mark_speed_um_per_sec: PositiveInt = 900_000
    fill_angle_tenths_deg: AngleTenthsDeg = 0
    hatch_spacing_um: PositiveInt = 80
    contour_direction: ContourDirection = ContourDirection.CLOCKWISE

    @field_validator("fill_angle_tenths_deg", mode="before")
    @classmethod
    def normalize_fill_angle(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return normalize_tenths_degrees(value)
        return value


class GlobalSettings(ContractModel):
    travel_speed_um_per_sec: PositiveInt = DEFAULT_TRAVEL_SPEED_UM_PER_SEC
    minimum_mark_segment_um: Literal[100] = MINIMUM_MARK_SEGMENT_UM
    initial_jump_to_origin: Literal[True] = True


class EntityBase(ContractModel):
    id: UUID
    name: str = Field(min_length=1, max_length=200)
    visible: bool = True
    locked: bool = False
    process: ProcessSpec = Field(default_factory=ProcessSpec)


class RectangleEntity(EntityBase):
    kind: Literal["rectangle"] = "rectangle"
    center: PointUm
    width_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)]
    height_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)]
    rotation_tenths_deg: AngleTenthsDeg = 0

    @field_validator("rotation_tenths_deg", mode="before")
    @classmethod
    def normalize_rotation(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return normalize_tenths_degrees(value)
        return value

class EllipseEntity(EntityBase):
    """A parameterized straight-edge approximation of an inscribed ellipse."""

    kind: Literal["ellipse"] = "ellipse"
    center: PointUm
    width_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)]
    height_um: Annotated[int, Field(gt=0, le=WORK_AREA_SIZE_UM)]
    rotation_tenths_deg: AngleTenthsDeg = 0
    sides: Annotated[int, Field(ge=3, le=MAX_ELLIPSE_SIDES, strict=True)] = DEFAULT_ELLIPSE_SIDES

    @field_validator("rotation_tenths_deg", mode="before")
    @classmethod
    def normalize_rotation(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return normalize_tenths_degrees(value)
        return value


class LineEntity(EntityBase):
    kind: Literal["line"] = "line"
    start: PointUm
    end: PointUm

    @model_validator(mode="after")
    def reject_zero_length_line(self) -> "LineEntity":
        if self.start == self.end:
            raise ValueError("line endpoints must be different")
        if self.process.mode not in (ProcessMode.NONE, ProcessMode.CONTOUR):
            raise ValueError("line entities support only none or contour process modes")
        return self


Ring = Annotated[list[PointUm], Field(min_length=3)]


class PolygonPart(ContractModel):
    outer_ring: Ring
    holes: list[Ring] = Field(default_factory=list)

    @model_validator(mode="after")
    def reject_duplicated_closing_vertices(self) -> "PolygonPart":
        for ring in (self.outer_ring, *self.holes):
            if ring[0] == ring[-1]:
                raise ValueError(
                    "canonical rings omit the duplicated closing vertex"
                )
            if any(a == b for a, b in zip(ring, ring[1:])):
                raise ValueError("polygon rings must not contain consecutive duplicate vertices")
        return self


class PolygonEntity(EntityBase):
    """Local straight-edge rings and their rigid placement in world coordinates."""

    kind: Literal["polygon"] = "polygon"
    position: PointUm = Field(default_factory=lambda: PointUm(x_um=0, y_um=0))
    rotation_tenths_deg: AngleTenthsDeg = 0
    parts: Annotated[list[PolygonPart], Field(min_length=1)]

    @field_validator("rotation_tenths_deg", mode="before")
    @classmethod
    def normalize_rotation(cls, value: object) -> object:
        if isinstance(value, int) and not isinstance(value, bool):
            return normalize_tenths_degrees(value)
        return value


Entity = Annotated[
    RectangleEntity | LineEntity | PolygonEntity | EllipseEntity,
    Field(discriminator="kind"),
]


class ProjectDocument(ContractModel):
    schema_version: Literal[2] = 2
    document_id: UUID
    project_name: str = Field(min_length=1, max_length=200)
    units: Literal["um"] = "um"
    work_area: WorkArea = Field(default_factory=WorkArea)
    grid: GridSettings = Field(default_factory=GridSettings)
    default_process: ProcessSpec = Field(default_factory=ProcessSpec)
    global_settings: GlobalSettings = Field(default_factory=GlobalSettings)
    entities: list[Entity] = Field(default_factory=list)
    processing_order: list[UUID] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def migrate_v1(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        version = value.get("schemaVersion", value.get("schema_version", 2))
        if type(version) is not int:
            raise ValueError("schema version must be an integer")
        if version != 1:
            return value
        migrated = deepcopy(value)
        key = "schemaVersion" if "schemaVersion" in migrated else "schema_version"
        migrated[key] = 2
        entities = migrated.get("entities", [])
        if not isinstance(entities, list):
            return migrated
        for index, entity in enumerate(entities):
            if isinstance(entity, dict) and entity.get("kind") == "ellipse":
                raise ValueError("ellipse requires project version 2")
            if isinstance(entity, dict) and entity.get("kind") == "polygon":
                if any(key in entity for key in ("position", "rotationTenthsDeg", "rotation_tenths_deg")):
                    raise ValueError("version 1 polygon vertices must be world coordinates")
                polygon = PolygonEntity.model_validate(entity)
                points = [point for part in polygon.parts for point in part.outer_ring]
                x = math.floor((min(p.x_um for p in points) + max(p.x_um for p in points)) / 2 + 0.5)
                y = math.floor((min(p.y_um for p in points) + max(p.y_um for p in points)) / 2 + 0.5)
                polygon = polygon.model_copy(update={
                    "position": PointUm(x_um=x, y_um=y),
                    "parts": [PolygonPart(
                        outer_ring=[PointUm(x_um=p.x_um-x, y_um=p.y_um-y) for p in part.outer_ring],
                        holes=[[PointUm(x_um=p.x_um-x, y_um=p.y_um-y) for p in ring] for ring in part.holes],
                    ) for part in polygon.parts],
                })
                entities[index] = polygon.model_dump(mode="json", by_alias=True)
        return migrated

    @model_validator(mode="after")
    def require_unique_entities_and_total_processing_order(self) -> "ProjectDocument":
        entity_ids = [entity.id for entity in self.entities]
        if len(entity_ids) != len(set(entity_ids)):
            raise ValueError("entity ids must be unique")
        if len(self.processing_order) != len(set(self.processing_order)):
            raise ValueError("processing order must not contain duplicate ids")
        if set(self.processing_order) != set(entity_ids):
            raise ValueError("processing order must contain every entity id exactly once")
        for entity in self.entities:
            if not _entity_is_inside_work_area(entity, self.work_area):
                raise ValueError(
                    f"entity {entity.id} extends outside the configured work area"
                )
            if isinstance(entity, (PolygonEntity, EllipseEntity)):
                # Import here to keep the model/conversion module boundary acyclic.
                from lasertisch.geometry.conversion import closed_entity_to_geometry

                closed_entity_to_geometry(entity)
        return self


def _point_is_inside_work_area(point: PointUm, work_area: WorkArea) -> bool:
    half_width = work_area.width_um / 2
    half_height = work_area.height_um / 2
    return (
        work_area.center.x_um - half_width <= point.x_um <= work_area.center.x_um + half_width
        and work_area.center.y_um - half_height <= point.y_um <= work_area.center.y_um + half_height
    )


def _rectangle_is_inside_work_area(
    rectangle: RectangleEntity, work_area: WorkArea
) -> bool:
    angle = math.radians(-rectangle.rotation_tenths_deg / 10)
    cos_angle = math.cos(angle)
    sin_angle = math.sin(angle)
    half_width = rectangle.width_um / 2
    half_height = rectangle.height_um / 2
    left = work_area.center.x_um - work_area.width_um / 2
    right = work_area.center.x_um + work_area.width_um / 2
    bottom = work_area.center.y_um - work_area.height_um / 2
    top = work_area.center.y_um + work_area.height_um / 2
    for local_x, local_y in (
        (-half_width, -half_height),
        (-half_width, half_height),
        (half_width, -half_height),
        (half_width, half_height),
    ):
        world_x = (
            rectangle.center.x_um + local_x * cos_angle - local_y * sin_angle
        )
        world_y = (
            rectangle.center.y_um + local_x * sin_angle + local_y * cos_angle
        )
        if not (left <= world_x <= right and bottom <= world_y <= top):
            return False
    return True


def _entity_is_inside_work_area(entity: Entity, work_area: WorkArea) -> bool:
    if isinstance(entity, EllipseEntity):
        return _entity_is_inside_work_area(ellipse_to_polygon(entity), work_area)
    if isinstance(entity, RectangleEntity):
        return _rectangle_is_inside_work_area(entity, work_area)
    if isinstance(entity, LineEntity):
        return _point_is_inside_work_area(
            entity.start, work_area
        ) and _point_is_inside_work_area(entity.end, work_area)
    return all(
        _point_is_inside_work_area(polygon_world_point(entity, point), work_area)
        for part in entity.parts
        for ring in (part.outer_ring, *part.holes)
        for point in ring
    )


def polygon_world_point(entity: PolygonEntity, point: PointUm) -> PointUm:
    """Round once onto the micron grid; match JavaScript Math.round at ties."""
    angle = math.radians(-entity.rotation_tenths_deg / 10)
    cosine, sine = math.cos(angle), math.sin(angle)
    return PointUm(
        x_um=entity.position.x_um + math.floor(point.x_um * cosine - point.y_um * sine + 0.5),
        y_um=entity.position.y_um + math.floor(point.x_um * sine + point.y_um * cosine + 0.5),
    )


def ellipse_to_polygon(entity: EllipseEntity) -> PolygonEntity:
    """Sample equal parameter angles, beginning on +X, on the local micron grid."""
    points = []
    for index in range(entity.sides):
        angle = 2 * math.pi * index / entity.sides
        points.append(PointUm(
            x_um=math.floor(entity.width_um / 2 * math.cos(angle) + 0.5 + 1e-7),
            y_um=math.floor(entity.height_um / 2 * math.sin(angle) + 0.5 + 1e-7),
        ))
    return PolygonEntity(
        id=entity.id, name=entity.name, visible=entity.visible, locked=entity.locked,
        process=entity.process, position=entity.center,
        rotation_tenths_deg=entity.rotation_tenths_deg,
        parts=[PolygonPart(outer_ring=points)],
    )

