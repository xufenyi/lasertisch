"""Shared Pydantic configuration for stable JSON contracts."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


def to_camel(value: str) -> str:
    """Convert an internal snake_case name to the public camelCase spelling."""

    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)


class ContractModel(BaseModel):
    """Base class for strict, camelCase serialized contract objects."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        populate_by_name=True,
        serialize_by_alias=True,
        validate_assignment=True,
    )

