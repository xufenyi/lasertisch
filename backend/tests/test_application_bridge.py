import json
from pathlib import Path
from uuid import UUID

from lasertisch.application import ApplicationApi, plan_toolpaths_payload


PROJECT_ROOT = Path(__file__).resolve().parents[2]
REQUEST_ID = "00000000-0000-0000-0000-000000000099"


def example_request(revision: int = 7) -> dict[str, object]:
    document = json.loads(
        (PROJECT_ROOT / "fixtures" / "project-v1.example.json").read_text(
            encoding="utf-8"
        )
    )
    return {
        "apiVersion": 1,
        "requestId": REQUEST_ID,
        "documentRevision": revision,
        "document": document,
    }


def test_application_api_returns_json_compatible_plan_and_echoes_revision() -> None:
    response = ApplicationApi().plan_toolpaths(example_request())

    assert response["ok"] is True
    assert response["requestId"] == REQUEST_ID
    assert response["documentRevision"] == 7
    assert response["plan"]["inputRevision"] == 7
    assert response["plan"]["preamble"][0]["end"] == {"xUm": 0, "yUm": 0}
    UUID(response["plan"]["planId"])


def test_invalid_payload_becomes_a_structured_failure() -> None:
    response = plan_toolpaths_payload({
        "apiVersion": 1,
        "requestId": REQUEST_ID,
        "documentRevision": 3,
        "document": {},
    })

    assert response["ok"] is False
    assert response["requestId"] == REQUEST_ID
    assert response["documentRevision"] == 3
    assert response["errors"][0]["code"] == "contract.invalid_plan_request"


def test_invalid_export_payload_becomes_a_structured_failure() -> None:
    response = ApplicationApi().export_device_program({
        "apiVersion": 1,
        "requestId": REQUEST_ID,
        "documentRevision": 3,
    })

    assert response["ok"] is False
    assert response["requestId"] == REQUEST_ID
    assert response["errors"][0]["code"] == "contract.invalid_export_request"
