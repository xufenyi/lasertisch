"""Compose canonical entities into an ordered device-independent toolpath."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from uuid import UUID, uuid4, uuid5

from lasertisch.domain.bridge import (
    InitialJump,
    LaserState,
    MotionSegment,
    SegmentKind,
    ToolpathPlan,
    ToolpathTask,
)
from lasertisch.domain.models import (
    Entity,
    LineEntity,
    PointUm,
    ProcessMode,
    ProjectDocument,
)
from lasertisch.geometry.conversion import closed_entity_to_geometry

from .contours import contour_paths
from .errors import PlanningError
from .hatch import hatch_segments


@dataclass(slots=True)
class _PlanBuilder:
    document: ProjectDocument
    plan_id: UUID
    current: PointUm = field(default_factory=lambda: PointUm(x_um=0, y_um=0))
    sequence: int = 0

    def _segment(
        self,
        *,
        kind: SegmentKind,
        laser: LaserState,
        start: PointUm,
        end: PointUm,
        speed_um_per_sec: int,
        source_entity_id: UUID,
        task_id: UUID,
    ) -> MotionSegment:
        segment = MotionSegment(
            sequence=self.sequence,
            kind=kind,
            laser=laser,
            start=start,
            end=end,
            speed_um_per_sec=speed_um_per_sec,
            source_entity_ids=[source_entity_id],
            task_id=task_id,
        )
        self.sequence += 1
        self.current = end
        return segment

    def travel_to(
        self, target: PointUm, entity_id: UUID, task_id: UUID
    ) -> MotionSegment | None:
        if self.current == target:
            return None
        return self._segment(
            kind=SegmentKind.TRAVEL,
            laser=LaserState.OFF,
            start=self.current,
            end=target,
            speed_um_per_sec=self.document.global_settings.travel_speed_um_per_sec,
            source_entity_id=entity_id,
            task_id=task_id,
        )

    def mark_path(
        self,
        points: Iterable[PointUm],
        kind: SegmentKind,
        entity: Entity,
        task_id: UUID,
    ) -> list[MotionSegment]:
        path = list(points)
        if len(path) < 2:
            return []
        segments: list[MotionSegment] = []
        travel = self.travel_to(path[0], entity.id, task_id)
        if travel is not None:
            segments.append(travel)
        for start, end in zip(path, path[1:]):
            if start == end:
                continue
            if self.current != start:
                bridge = self.travel_to(start, entity.id, task_id)
                if bridge is not None:
                    segments.append(bridge)
            segments.append(
                self._segment(
                    kind=kind,
                    laser=LaserState.ON,
                    start=start,
                    end=end,
                    speed_um_per_sec=entity.process.mark_speed_um_per_sec,
                    source_entity_id=entity.id,
                    task_id=task_id,
                )
            )
        return segments

    def _contour_segments(
        self, entity: Entity, task_id: UUID
    ) -> list[MotionSegment]:
        if isinstance(entity, LineEntity):
            return self.mark_path(
                [entity.start, entity.end], SegmentKind.OPEN_LINE, entity, task_id
            )
        geometry = closed_entity_to_geometry(entity)
        segments: list[MotionSegment] = []
        for path in contour_paths(
            geometry, entity.process.contour_direction, self.current
        ):
            segments.extend(
                self.mark_path(path, SegmentKind.CONTOUR, entity, task_id)
            )
        return segments

    def _fill_segments(self, entity: Entity, task_id: UUID) -> list[MotionSegment]:
        if isinstance(entity, LineEntity):
            raise PlanningError("cam.fill_not_supported_for_open_geometry", entityId=str(entity.id))
        geometry = closed_entity_to_geometry(entity)
        hatches = hatch_segments(
            geometry,
            entity.process.fill_angle_tenths_deg,
            entity.process.hatch_spacing_um,
            self.document.global_settings.minimum_mark_segment_um,
        )
        segments: list[MotionSegment] = []
        for hatch in hatches:
            segments.extend(
                self.mark_path(
                    [hatch.start, hatch.end], SegmentKind.HATCH, entity, task_id
                )
            )
        return segments

    def entity_task(self, entity: Entity) -> ToolpathTask | None:
        mode = entity.process.mode
        if mode is ProcessMode.NONE:
            return None
        task_id = uuid5(self.plan_id, f"entity:{entity.id}")
        segments: list[MotionSegment] = []

        if mode is ProcessMode.CONTOUR:
            segments.extend(self._contour_segments(entity, task_id))
        elif mode is ProcessMode.FILL:
            segments.extend(self._fill_segments(entity, task_id))
        elif mode is ProcessMode.FILL_THEN_CONTOUR:
            segments.extend(self._fill_segments(entity, task_id))
            segments.extend(self._contour_segments(entity, task_id))
        elif mode is ProcessMode.CONTOUR_THEN_FILL:
            segments.extend(self._contour_segments(entity, task_id))
            segments.extend(self._fill_segments(entity, task_id))

        if not any(segment.laser is LaserState.ON for segment in segments):
            raise PlanningError("cam.no_mark_segments", entityId=str(entity.id))
        return ToolpathTask(
            task_id=task_id,
            source_entity_ids=[entity.id],
            segments=segments,
        )


def plan_document(
    document: ProjectDocument,
    input_revision: int,
    *,
    plan_id: UUID | None = None,
) -> ToolpathPlan:
    """Plan every process-enabled entity without changing document order."""

    actual_plan_id = plan_id or uuid4()
    builder = _PlanBuilder(document=document, plan_id=actual_plan_id)
    by_id = {entity.id: entity for entity in document.entities}
    tasks: list[ToolpathTask] = []
    for entity_id in document.processing_order:
        task = builder.entity_task(by_id[entity_id])
        if task is not None:
            tasks.append(task)

    return ToolpathPlan(
        plan_id=actual_plan_id,
        input_revision=input_revision,
        preamble=[
            InitialJump(
                speed_um_per_sec=document.global_settings.travel_speed_um_per_sec
            )
        ],
        tasks=tasks,
    )

