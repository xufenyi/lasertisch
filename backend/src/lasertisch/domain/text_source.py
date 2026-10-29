"""Portable text source shared by project entities and generation requests."""
import unicodedata
from typing import Annotated, Literal
from pydantic import Field, field_validator, model_validator
from .common import ContractModel

SHA256 = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
FONT_ID = Annotated[str, Field(pattern=r"^[0-9a-f]{64}:[0-9]+$")]
MAX_TEXT_VERTICES = 100_000


class FontReference(ContractModel):
    id: FONT_ID
    fingerprint: SHA256
    face_index: Annotated[int, Field(ge=0)]
    family: str = Field(min_length=1, max_length=200)
    style: str = Field(min_length=1, max_length=200)
    full_name: str = Field(min_length=1, max_length=300)
    postscript_name: str = Field(min_length=1, max_length=300)
    units_per_em: Annotated[int, Field(gt=0, le=65536)]
    bundled: bool

    @model_validator(mode="after")
    def validate_identity(self) -> "FontReference":
        if self.id != f"{self.fingerprint}:{self.face_index}":
            raise ValueError("font identity must match its fingerprint and collection face")
        return self


class TextParameters(ContractModel):
    content: str = Field(min_length=1, max_length=256)
    font_id: FONT_ID | None = None
    font_size_um: Annotated[int, Field(gt=0, le=190_000, strict=True)] = 10_000
    curve_tolerance_um: Annotated[int, Field(ge=1, le=1000, strict=True)] = 5
    short_segment_target_um: Annotated[int, Field(ge=0, le=190_000, strict=True)] = 0

    @field_validator("content")
    @classmethod
    def single_line(cls, value: str) -> str:
        if not value.strip() or any(unicodedata.category(char) in {"Cc", "Cs", "Zl", "Zp"} for char in value):
            raise ValueError("text requires a nonblank single line without control characters")
        return value


class TextSource(ContractModel):
    content: str = Field(min_length=1, max_length=256)
    font: FontReference
    font_size_um: Annotated[int, Field(gt=0, le=190_000, strict=True)]
    curve_tolerance_um: Annotated[int, Field(ge=1, le=1000, strict=True)]
    short_segment_target_um: Annotated[int, Field(ge=0, le=190_000, strict=True)] = 0
    layout: Literal["single_line"] = "single_line"

    _single_line = field_validator("content")(TextParameters.single_line.__func__)


