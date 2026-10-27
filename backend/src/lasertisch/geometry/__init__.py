"""Shapely conversion and precision helpers for canonical geometry."""

from .conversion import closed_entity_to_geometry, entity_to_geometry
from .errors import GeometryContractError

__all__ = [
    "GeometryContractError",
    "closed_entity_to_geometry",
    "entity_to_geometry",
]

