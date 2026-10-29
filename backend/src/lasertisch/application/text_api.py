"""Read-only font discovery and text outline API boundaries."""
from pydantic import ValidationError

from lasertisch.domain.bridge import ApiIssue
from lasertisch.domain.text import FontCatalogRequest, FontCatalogResponse, TextOutlineRequest, TextOutlineResponse
from lasertisch.text.errors import TextGeometryError
from lasertisch.text.fonts import FONT_REPOSITORY
from lasertisch.text.outlines import generate_text_outline
from .bridge import _request_identity


def font_catalog_payload(payload: object):
    request_id, _ = _request_identity(payload)
    try:
        request = FontCatalogRequest.model_validate(payload)
        default, fonts, _ = FONT_REPOSITORY.list_fonts(request.include_system, request.refresh)
    except TextGeometryError as error:
        response = FontCatalogResponse(request_id=request_id,ok=False,errors=[ApiIssue(code=error.code,parameters=error.parameters)])
    except ValidationError:
        response = FontCatalogResponse(request_id=request_id,ok=False,errors=[ApiIssue(code="contract.invalid_font_request")])
    except Exception:  # pragma: no cover - protect native bridge from corrupt installed fonts
        response = FontCatalogResponse(request_id=request_id,ok=False,errors=[ApiIssue(code="font.catalog_failed")])
    else:
        response = FontCatalogResponse(request_id=request.request_id,ok=True,default_font_id=default,fonts=fonts)
    return response.model_dump(mode="json",by_alias=True)


def text_outline_payload(payload: object):
    request_id, revision = _request_identity(payload)
    try:
        request = TextOutlineRequest.model_validate(payload)
    except ValidationError:
        return TextOutlineResponse(request_id=request_id,document_revision=revision,ok=False,
            errors=[ApiIssue(code="contract.invalid_text_request")]).model_dump(mode="json",by_alias=True)
    try:
        snapshot,warnings = generate_text_outline(request.parameters)
    except TextGeometryError as error:
        response = TextOutlineResponse(request_id=request.request_id,document_revision=request.document_revision,
            ok=False,errors=[ApiIssue(code=error.code,parameters=error.parameters)])
    except (ValueError,KeyError,IndexError,RecursionError):
        response = TextOutlineResponse(request_id=request.request_id,document_revision=request.document_revision,
            ok=False,errors=[ApiIssue(code="text.invalid_outline")])
    except Exception:  # pragma: no cover - defensive font parser / GEOS boundary
        response = TextOutlineResponse(request_id=request.request_id,document_revision=request.document_revision,
            ok=False,errors=[ApiIssue(code="text.conversion_failed")])
    else:
        response = TextOutlineResponse(request_id=request.request_id,document_revision=request.document_revision,
            ok=True,snapshot=snapshot,warnings=warnings)
    return response.model_dump(mode="json",by_alias=True)
