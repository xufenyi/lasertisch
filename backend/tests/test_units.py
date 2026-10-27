import pytest

from lasertisch.domain.units import (
    micrometres_to_millimetres_text,
    millimetres_text_to_micrometres,
    normalize_tenths_degrees,
)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("12.345", 12_345),
        ("-4.567", -4_567),
        ("20.001", 20_001),
        ("0", 0),
    ],
)
def test_exact_millimetre_input(source: str, expected: int) -> None:
    assert millimetres_text_to_micrometres(source) == expected


def test_sub_micron_input_is_rejected_instead_of_rounded() -> None:
    with pytest.raises(ValueError, match="finer than"):
        millimetres_text_to_micrometres("1.0005")


@pytest.mark.parametrize(
    ("source", "expected"),
    [(12_345, "12.345"), (-4_500, "-4.5"), (20_000, "20")],
)
def test_exact_millimetre_output(source: int, expected: str) -> None:
    assert micrometres_to_millimetres_text(source) == expected


@pytest.mark.parametrize(
    ("source", "expected"),
    [(0, 0), (3600, 0), (3611, 11), (-1, 3599), (-7201, 3599)],
)
def test_angle_normalization(source: int, expected: int) -> None:
    assert normalize_tenths_degrees(source) == expected

