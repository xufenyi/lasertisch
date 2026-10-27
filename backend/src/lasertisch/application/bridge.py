"""Stable application API used by both the development bridge and pywebview."""

from __future__ import annotations

from base64 import b64encode
from typing import Any
from uuid import UUID, uuid4

from pydantic import ValidationError

from lasertisch.cam.errors import PlanningError
from lasertisch.cam.planner import plan_document
from lasertisch.device.errors import DeviceExportError
from lasertisch.device.exporter import export_toolpath
from lasertisch.domain.bridge import (
    ApiIssue,
    ExportRequest,
    ExportResponse,
    PlanRequest,
    PlanResponse,
)


def _request_identity(payload: object) -> tuple[UUID, int]:
    if not isinstance(payload, dict):
        return uuid4(), 0
    try:
        request_id = UUID(str(payload.get("requestId", "")))
    except (ValueError, TypeError, AttributeError):
        request_id = uuid4()
    revision = payload.get("documentRevision", 0)
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
        revision = 0
    return request_id, revision


def plan_toolpaths_payload(payload: object) -> dict[str, Any]:
    """Validate a JSON-compatible request and return a JSON-compatible response."""

    try:
        request = PlanRequest.model_validate(payload)
    except ValidationError as error:
        request_id, revision = _request_identity(payload)
        response = PlanResponse(
            request_id=request_id,
            document_revision=revision,
            ok=False,
            errors=[
                ApiIssue(
                    code="contract.invalid_plan_request",
                    parameters={"detail": str(error)},
                )
            ],
        )
        return response.model_dump(mode="json", by_alias=True)

    try:
        plan = plan_document(request.document, request.document_revision)
    except PlanningError as error:
        response = PlanResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=False,
            errors=[ApiIssue(code=error.code, parameters=error.parameters)],
        )
    except Exception as error:  # pragma: no cover - defensive bridge boundary
        response = PlanResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=False,
            errors=[
                ApiIssue(
                    code="cam.unexpected_planning_failure",
                    parameters={"detail": str(error)},
                )
            ],
        )
    else:
        response = PlanResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=True,
            plan=plan,
        )
    return response.model_dump(mode="json", by_alias=True)


def export_device_program_payload(payload: object) -> dict[str, Any]:
    """Validate, encode, and return a device program as base64 file content."""

    try:
        request = ExportRequest.model_validate(payload)
    except ValidationError as error:
        request_id, revision = _request_identity(payload)
        response = ExportResponse(
            request_id=request_id,
            document_revision=revision,
            ok=False,
            errors=[
                ApiIssue(
                    code="contract.invalid_export_request",
                    parameters={"detail": str(error)},
                )
            ],
        )
        return response.model_dump(mode="json", by_alias=True)

    try:
        if request.plan.input_revision != request.document_revision:
            raise DeviceExportError(
                "device.stale_plan",
                planRevision=request.plan.input_revision,
                documentRevision=request.document_revision,
            )
        program = export_toolpath(request.plan, request.format)
    except DeviceExportError as error:
        response = ExportResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=False,
            errors=[ApiIssue(code=error.code, parameters=error.parameters)],
        )
    except ValueError as error:
        response = ExportResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=False,
            errors=[
                ApiIssue(
                    code="device.encoding_failed",
                    parameters={"detail": str(error)},
                )
            ],
        )
    except Exception as error:  # pragma: no cover - defensive bridge boundary
        response = ExportResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=False,
            errors=[
                ApiIssue(
                    code="device.unexpected_export_failure",
                    parameters={"detail": str(error)},
                )
            ],
        )
    else:
        response = ExportResponse(
            request_id=request.request_id,
            document_revision=request.document_revision,
            ok=True,
            format=request.format,
            media_type=program.media_type,
            filename_extension=program.filename_extension,
            content_base64=b64encode(program.content).decode("ascii"),
            command_count=program.command_count,
        )
    return response.model_dump(mode="json", by_alias=True)


class ApplicationApi:
    """Method container whose public shape is compatible with pywebview exposure."""

    def plan_toolpaths(self, request: object) -> dict[str, Any]:
        return plan_toolpaths_payload(request)

    def export_device_program(self, request: object) -> dict[str, Any]:
        return export_device_program_payload(request)
