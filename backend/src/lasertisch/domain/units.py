"""Explicit conversions at the document/UI unit boundary."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation


UM_PER_MM = 1000
ANGLE_TENTHS_PER_TURN = 3600


def normalize_tenths_degrees(value: int) -> int:
    """Normalize a clockwise angle to the canonical ``[0, 3600)`` range."""

    return value % ANGLE_TENTHS_PER_TURN


def millimetres_text_to_micrometres(value: str) -> int:
    """Parse an exact millimetre string without silently rounding sub-micron input."""

    try:
        decimal_value = Decimal(value.strip())
    except InvalidOperation as exc:
        raise ValueError(f"invalid millimetre value: {value!r}") from exc

    if not decimal_value.is_finite():
        raise ValueError("millimetre value must be finite")

    micrometres = decimal_value * UM_PER_MM
    integral = micrometres.to_integral_value()
    if micrometres != integral:
        raise ValueError("millimetre value has precision finer than 0.001 mm")
    return int(integral)


def micrometres_to_millimetres_text(value: int) -> str:
    """Format integer micrometres as exact millimetres without float conversion."""

    sign = "-" if value < 0 else ""
    magnitude = abs(value)
    whole, fraction = divmod(magnitude, UM_PER_MM)
    if fraction == 0:
        return f"{sign}{whole}"
    return f"{sign}{whole}.{fraction:03d}".rstrip("0")

