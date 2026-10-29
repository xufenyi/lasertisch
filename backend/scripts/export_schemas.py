"""Export the checked-in JSON Schemas from the authoritative Pydantic models."""

from __future__ import annotations

import json
from pathlib import Path

from lasertisch.domain.bridge import BooleanRequest, BooleanResponse, ExportRequest, ExportResponse, PlanRequest, PlanResponse
from lasertisch.domain.common import ContractModel
from lasertisch.domain.models import ProjectDocument
from lasertisch.domain.text import FontCatalogRequest, FontCatalogResponse, TextOutlineRequest, TextOutlineResponse, TextOutlineSnapshot


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIRECTORY = PROJECT_ROOT / "schemas"


def write_schema(name: str, model: type[ContractModel]) -> None:
    schema = model.model_json_schema(by_alias=True, mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = f"https://lasertisch.local/schemas/{name}"
    target = SCHEMA_DIRECTORY / name
    target.write_text(
        json.dumps(schema, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def main() -> None:
    SCHEMA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    # Keep the archived v1 schema unchanged; the live model serializes v2.
    write_schema("project-v2.schema.json", ProjectDocument)
    write_schema("plan-request-v1.schema.json", PlanRequest)
    write_schema("plan-response-v1.schema.json", PlanResponse)
    write_schema("export-request-v1.schema.json", ExportRequest)
    write_schema("export-response-v1.schema.json", ExportResponse)
    write_schema("boolean-request-v1.schema.json", BooleanRequest)
    write_schema("boolean-response-v1.schema.json", BooleanResponse)
    write_schema("font-catalog-request-v1.schema.json", FontCatalogRequest)
    write_schema("font-catalog-response-v1.schema.json", FontCatalogResponse)
    write_schema("text-outline-request-v1.schema.json", TextOutlineRequest)
    write_schema("text-outline-response-v1.schema.json", TextOutlineResponse)
    write_schema("text-outline-snapshot-v1.schema.json", TextOutlineSnapshot)


if __name__ == "__main__":
    main()

