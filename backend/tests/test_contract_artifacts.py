import json
from pathlib import Path

import pytest

from lasertisch.domain.bridge import BooleanRequest, BooleanResponse, ExportRequest, ExportResponse, PlanRequest, PlanResponse
from lasertisch.domain.common import ContractModel
from lasertisch.domain.models import ProjectDocument, RectangleEntity


PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize(
    ("filename", "model"),
    [
        ("project-v2.schema.json", ProjectDocument),
        ("plan-request-v1.schema.json", PlanRequest),
        ("plan-response-v1.schema.json", PlanResponse),
        ("export-request-v1.schema.json", ExportRequest),
        ("export-response-v1.schema.json", ExportResponse),
        ("boolean-request-v1.schema.json", BooleanRequest),
        ("boolean-response-v1.schema.json", BooleanResponse),
    ],
)
def test_checked_in_schema_matches_authoritative_model(
    filename: str, model: type[ContractModel]
) -> None:
    expected = model.model_json_schema(by_alias=True, mode="serialization")
    expected["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    expected["$id"] = f"https://lasertisch.local/schemas/{filename}"
    actual = json.loads(
        (PROJECT_ROOT / "schemas" / filename).read_text(encoding="utf-8")
    )

    assert actual == expected


def test_example_project_is_a_valid_precision_preserving_document() -> None:
    source = (PROJECT_ROOT / "fixtures" / "project-v1.example.json").read_text(
        encoding="utf-8"
    )
    document = ProjectDocument.model_validate_json(source)

    rectangle = document.entities[0]
    assert isinstance(rectangle, RectangleEntity)
    assert rectangle.center.x_um == 12_345
    assert rectangle.width_um == 20_001

