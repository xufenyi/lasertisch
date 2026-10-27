"""Version 1 React/Python bridge and device-independent trajectory contracts."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, PositiveInt, model_validator

from .common import ContractModel
from .models import PointUm, ProjectDocument


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

