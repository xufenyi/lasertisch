"""Single-line text inputs and portable, font-independent outline snapshots."""
from __future__ import annotations

import hashlib
import json
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, model_validator

from .bridge import ApiIssue
from .common import ContractModel
from .models import PolygonEntity, PolygonPart

from .text_source import SHA256, FONT_ID, MAX_TEXT_VERTICES, FontReference, TextParameters, TextSource


def canonical_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")).encode("utf-8")).hexdigest()


class TextOutlineSnapshot(ContractModel):
    source: TextSource
    generator_version: Literal["font-outline-v1"] = "font-outline-v1"
    engine_versions: dict[str, Annotated[str, Field(min_length=1)]] = Field(min_length=1)
    source_hash: SHA256
    geometry_hash: SHA256
    parts: Annotated[list[PolygonPart], Field(min_length=1)]
    advance_um: Annotated[int, Field(ge=0)]
    glyph_count: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def validate_snapshot(self) -> "TextOutlineSnapshot":
        if sum(len(ring) for part in self.parts for ring in (part.outer_ring, *part.holes)) > MAX_TEXT_VERTICES:
            raise ValueError("text outline exceeds the vertex budget")
        if self.source_hash != canonical_hash(self.source.model_dump(mode="json", by_alias=True)):
            raise ValueError("text source does not match the saved snapshot")
        if self.geometry_hash != canonical_hash([part.model_dump(mode="json", by_alias=True) for part in self.parts]):
            raise ValueError("text geometry does not match the saved snapshot")
        # No font lookup or regeneration when opening a saved snapshot.
        from lasertisch.geometry.conversion import closed_entity_to_geometry
        closed_entity_to_geometry(PolygonEntity(id=UUID(int=1), name="Text outline", parts=self.parts))
        return self


class FontCatalogRequest(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    include_system: bool = True
    refresh: bool = False


class FontCatalogResponse(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    ok: bool
    default_font_id: FONT_ID | None = None
    fonts: list[FontReference] = Field(default_factory=list)
    errors: list[ApiIssue] = Field(default_factory=list)
    warnings: list[ApiIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_result(self) -> "FontCatalogResponse":
        if self.ok and (self.errors or not self.fonts or self.default_font_id not in {font.id for font in self.fonts}):
            raise ValueError("font catalog needs a present default font and no errors")
        if not self.ok and (not self.errors or self.fonts or self.default_font_id is not None):
            raise ValueError("failed font catalog must contain errors only")
        return self


class TextOutlineRequest(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: Annotated[int, Field(ge=0)]
    parameters: TextParameters


class TextOutlineResponse(ContractModel):
    api_version: Literal[1] = 1
    request_id: UUID
    document_revision: Annotated[int, Field(ge=0)]
    ok: bool
    snapshot: TextOutlineSnapshot | None = None
    errors: list[ApiIssue] = Field(default_factory=list)
    warnings: list[ApiIssue] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_result(self) -> "TextOutlineResponse":
        if self.ok and (self.snapshot is None or self.errors):
            raise ValueError("successful text conversion requires a snapshot and no errors")
        if not self.ok and (self.snapshot is not None or not self.errors):
            raise ValueError("failed text conversion requires errors without a snapshot")
        return self
