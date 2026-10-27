"""Export the checked-in JSON Schemas from the authoritative Pydantic models."""

from __future__ import annotations

import json
from pathlib import Path

from lasertisch.domain.bridge import PlanRequest, PlanResponse
from lasertisch.domain.common import ContractModel
from lasertisch.domain.models import ProjectDocument


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
    )


def main() -> None:
    SCHEMA_DIRECTORY.mkdir(parents=True, exist_ok=True)
    write_schema("project-v1.schema.json", ProjectDocument)
    write_schema("plan-request-v1.schema.json", PlanRequest)
    write_schema("plan-response-v1.schema.json", PlanResponse)


if __name__ == "__main__":
    main()

