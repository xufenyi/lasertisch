"""Version 1 canonical project document models.

Fabric.js objects and Shapely geometries are projections of these models. They are
never persisted as the authoritative project representation.
"""

from __future__ import annotations

import math
from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PositiveInt, field_validator, model_validator

from .common import ContractModel
from .units import normalize_tenths_degrees


WORK_AREA_SIZE_UM = 190_000
DEFAULT_TRAVEL_SPEED_UM_PER_SEC = 10_000_000
MINIMUM_MARK_SEGMENT_UM = 100

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
    hatch_spacing_um: PositiveInt = 160
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
        return self


class PolygonEntity(EntityBase):
    """A baked boolean result with one or more disconnected polygon parts."""

    kind: Literal["polygon"] = "polygon"
    parts: Annotated[list[PolygonPart], Field(min_length=1)]


Entity = Annotated[
    RectangleEntity | LineEntity | PolygonEntity,
    Field(discriminator="kind"),
]


class ProjectDocument(ContractModel):
    schema_version: Literal[1] = 1
    document_id: UUID
    project_name: str = Field(min_length=1, max_length=200)
    units: Literal["um"] = "um"
    work_area: WorkArea = Field(default_factory=WorkArea)
    grid: GridSettings = Field(default_factory=GridSettings)
    default_process: ProcessSpec = Field(default_factory=ProcessSpec)
    global_settings: GlobalSettings = Field(default_factory=GlobalSettings)
    entities: list[Entity] = Field(default_factory=list)
    processing_order: list[UUID] = Field(default_factory=list)

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
    if isinstance(entity, RectangleEntity):
        return _rectangle_is_inside_work_area(entity, work_area)
    if isinstance(entity, LineEntity):
        return _point_is_inside_work_area(
            entity.start, work_area
        ) and _point_is_inside_work_area(entity.end, work_area)
    return all(
        _point_is_inside_work_area(point, work_area)
        for part in entity.parts
        for ring in (part.outer_ring, *part.holes)
        for point in ring
    )

