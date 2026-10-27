from base64 import b64decode
import struct
from uuid import UUID

import pytest

from lasertisch.application import export_device_program_payload
from lasertisch.cam import plan_document
from lasertisch.device.errors import DeviceExportError
from lasertisch.device.exporter import export_toolpath, motion_commands_for_plan
from lasertisch.device.protocol import JUMP_ABSOLUTE_COMMAND, MARK_ABSOLUTE_COMMAND
from lasertisch.domain.bridge import ExportFormat
from lasertisch.domain.models import LineEntity, PointUm, ProjectDocument


DOCUMENT_ID = UUID("60000000-0000-0000-0000-000000000001")
ENTITY_ID = UUID("60000000-0000-0000-0000-000000000002")
PLAN_ID = UUID("60000000-0000-0000-0000-000000000003")
REQUEST_ID = "60000000-0000-0000-0000-000000000004"


def line_plan(revision: int = 5):
    line = LineEntity(
        id=ENTITY_ID,
        name="Directed line",
        start=PointUm(x_um=10_000, y_um=-2_000),
        end=PointUm(x_um=20_000, y_um=3_000),
    )
    document = ProjectDocument(
        document_id=DOCUMENT_ID,
        project_name="Export",
        entities=[line],
        processing_order=[ENTITY_ID],
    )
    return plan_document(document, revision, plan_id=PLAN_ID)


def test_plan_maps_to_explicit_origin_jump_and_ordered_segment_endpoints() -> None:
    commands = motion_commands_for_plan(line_plan())

    assert [(item.kind, item.x_mm, item.y_mm) for item in commands] == [
        ("jump", 0.0, 0.0),
        ("jump", 10.0, -2.0),
        ("mark", 20.0, 3.0),
    ]
    assert commands[0].speed_mm_s == 10_000.0
    assert commands[2].speed_mm_s == 900.0


def test_csv_and_dbd_use_the_same_motion_command_stream() -> None:
    plan = line_plan()
    csv_program = export_toolpath(plan, ExportFormat.CSV)
    dbd_program = export_toolpath(plan, ExportFormat.DBD)

    assert csv_program.content.decode("utf-8").splitlines() == [
        "command,x,y,speed",
        "jump,0,0,10000",
        "jump,10,-2,10000",
        "mark,20,3,900",
    ]
    # Seven header parameters occupy 39 bytes. Two jumps follow, then a
    # mark-speed parameter and the final absolute mark command.
    assert struct.unpack_from("<H", dbd_program.content, 39)[0] == JUMP_ABSOLUTE_COMMAND
    assert struct.unpack_from("<H", dbd_program.content, 49)[0] == JUMP_ABSOLUTE_COMMAND
    assert struct.unpack_from("<H", dbd_program.content, 66)[0] == MARK_ABSOLUTE_COMMAND
    x_inch, y_inch = struct.unpack_from("<ff", dbd_program.content, 68)
    assert x_inch * 25.4 == pytest.approx(20.0)
    assert y_inch * 25.4 == pytest.approx(3.0)
    assert csv_program.command_count == dbd_program.command_count == 3


def test_discontinuous_or_reordered_plan_is_rejected_before_encoding() -> None:
    plan = line_plan()
    plan.tasks[0].segments[0].start = PointUm(x_um=1, y_um=0)

    with pytest.raises(DeviceExportError, match="device.discontinuous_toolpath"):
        motion_commands_for_plan(plan)


def test_application_export_response_is_json_compatible_and_revision_bound() -> None:
    plan = line_plan()
    request = {
        "apiVersion": 1,
        "requestId": REQUEST_ID,
        "documentRevision": 5,
        "format": "csv",
        "plan": plan.model_dump(mode="json", by_alias=True),
    }

    response = export_device_program_payload(request)

    assert response["ok"] is True
    assert response["filenameExtension"] == "csv"
    assert response["commandCount"] == 3
    assert b64decode(response["contentBase64"]).startswith(b"command,x,y,speed\n")

    request["documentRevision"] = 6
    stale_response = export_device_program_payload(request)
    assert stale_response["ok"] is False
    assert stale_response["errors"][0]["code"] == "device.stale_plan"
