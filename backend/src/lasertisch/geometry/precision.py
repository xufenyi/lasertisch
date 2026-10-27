"""The single precision boundary used by Shapely and canonical coordinates."""

from __future__ import annotations

from collections.abc import Iterable

from shapely import set_precision
from shapely.geometry.base import BaseGeometry

from lasertisch.domain.models import PointUm

from .errors import GeometryContractError


UM_PER_MM = 1000
GRID_SIZE_MM = 0.001
GRID_RESIDUAL_TOLERANCE_UM = 1e-6


def um_to_mm(value_um: int) -> float:
    return value_um / UM_PER_MM


def snap_geometry(geometry: BaseGeometry) -> BaseGeometry:
    """Snap once to the canonical micron grid while preserving valid output."""

    return set_precision(geometry, GRID_SIZE_MM, mode="valid_output")


def mm_to_um(value_mm: float) -> int:
    scaled = value_mm * UM_PER_MM
    quantized = round(scaled)
    if abs(scaled - quantized) > GRID_RESIDUAL_TOLERANCE_UM:
        raise GeometryContractError(
            "geometry.coordinate_off_micron_grid",
            valueMm=value_mm,
            residualUm=scaled - quantized,
        )
    return int(quantized)


def coordinate_to_point_um(coordinate: tuple[float, float]) -> PointUm:
    return PointUm(x_um=mm_to_um(coordinate[0]), y_um=mm_to_um(coordinate[1]))


def remove_consecutive_duplicate_points(points: Iterable[PointUm]) -> list[PointUm]:
    result: list[PointUm] = []
    for point in points:
        if not result or result[-1] != point:
            result.append(point)
    return result

