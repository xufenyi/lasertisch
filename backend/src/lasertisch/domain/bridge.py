"""Version 1 React/Python bridge and device-independent trajectory contracts."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PositiveInt, model_validator

from .common import ContractModel
from .models import PointUm, PolygonEntity, ProjectDocument


# Kept as a named alias so the generated JSON Schema carries the lower bound.
AnnotatedNonNegativeInt = Annotated[int, Field(ge=0)]


class LaserState(StrEnum):
    OFF = "off"
    ON = "on"


class SegmentKind(StrEnum):
    TRAVEL = "travel"
    CONTOUR = "contour"
    HATCH = "hatch"
    OPEN_LINE = "open_line"


class InitialJump(ContractModel):
    kind: Literal["initial_jump"] = "initial_jump"
    start: None = None
    end: PointUm = Field(default_factory=lambda: PointUm(x_um=0, y_um=0))
    laser: Literal[LaserState.OFF] = LaserState.OFF
    speed_um_per_sec: PositiveInt

    @model_validator(mode="after")
    def require_world_origin(self) -> "InitialJump":
        if self.end.x_um != 0 or self.end.y_um != 0:
            raise ValueError("initial jump must target the world origin")
        return self


class MotionSegment(ContractModel):
    sequence: AnnotatedNonNegativeInt
    kind: SegmentKind
    laser: LaserState
    start: PointUm
    end: PointUm
    speed_um_per_sec: PositiveInt
    source_entity_ids: list[UUID] = Field(min_length=1)
    task_id: UUID

    @model_validator(mode="after")
    def require_explicit_laser_semantics(self) -> "MotionSegment":
        expected = LaserState.OFF if self.kind is SegmentKind.TRAVEL else LaserState.ON
        if self.laser is not expected:
            raise ValueError(f"{self.kind.value} segment requires laser={expected.value}")
        if self.start == self.end:
            raise ValueError("motion segment must have non-zero length")
        return self


class ToolpathTask(ContractModel):
    task_id: UUID
    source_entity_ids: list[UUID] = Field(min_length=1)
    segments: list[MotionSegment] = Field(default_factory=list)


class ToolpathPlan(ContractModel):
    plan_id: UUID
    input_revision: AnnotatedNonNegativeInt
    preamble: list[InitialJump] = Field(min_length=1, max_length=1)
    tasks: list[ToolpathTask] = Field(default_factory=list)


class ApiIssue(ContractModel):
    code: str = Field(pattern=r"^[a-z][a-z0-9_.-]*$")
    parameters: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict
    )


class BooleanOperation(StrEnum):
    UNION = "union"
    INTERSECTION = "intersection"
    DIFFERENCE = "difference"


class BooleanRequest(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    document: ProjectDocument
    operation: BooleanOperation
    operand_a_id: UUID
    operand_b_id: UUID


class BooleanResponse(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    ok: bool
    result: PolygonEntity | None = None
    empty: bool = False
    errors: list[ApiIssue] = Field(default_factory=list)
    warnings: list[ApiIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_consistent_result(self) -> "BooleanResponse":
        if self.ok and (self.errors or self.empty != (self.result is None)):
            raise ValueError("successful boolean requires either a polygon or an empty result")
        if not self.ok and (not self.errors or self.result is not None or self.empty):
            raise ValueError("failed boolean requires errors without result data")
        return self


class PlanRequest(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    document: ProjectDocument


class PlanResponse(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    ok: bool
    plan: ToolpathPlan | None = None
    errors: list[ApiIssue] = Field(default_factory=list)
    warnings: list[ApiIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_consistent_result(self) -> "PlanResponse":
        if self.ok and (self.plan is None or self.errors):
            raise ValueError("successful response requires a plan and no errors")
        if not self.ok and (self.plan is not None or not self.errors):
            raise ValueError("failed response requires errors and no plan")
        return self


class ExportFormat(StrEnum):
    CSV = "csv"
    DBD = "dbd"


class ExportRequest(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    format: ExportFormat
    plan: ToolpathPlan


class ExportResponse(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: AnnotatedNonNegativeInt
    ok: bool
    format: ExportFormat | None = None
    media_type: str | None = None
    filename_extension: str | None = None
    content_base64: str | None = None
    command_count: AnnotatedNonNegativeInt = 0
    errors: list[ApiIssue] = Field(default_factory=list)
    warnings: list[ApiIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def require_consistent_result(self) -> "ExportResponse":
        payload_fields = (
            self.format,
            self.media_type,
            self.filename_extension,
            self.content_base64,
        )
        if self.ok and (any(value is None for value in payload_fields) or self.errors):
            raise ValueError("successful export requires file data and no errors")
        if not self.ok and (any(value is not None for value in payload_fields) or not self.errors):
            raise ValueError("failed export requires errors and no file data")
        return self

