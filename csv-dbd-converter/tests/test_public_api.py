import pytest

from csv_dbd_converter.dbd_codec import decode_dbd, encode_dbd
from csv_dbd_converter.models import MotionCommand, MotionKind


def test_public_models_and_codec_are_importable() -> None:
    kind: MotionKind = "jump"
    source = [MotionCommand(kind, 10.0, -5.0, 7000.0)]

    restored = decode_dbd(encode_dbd(source))

    assert len(restored) == 1
    assert restored[0].kind == "jump"
    assert restored[0].x_mm == pytest.approx(10.0)
    assert restored[0].y_mm == pytest.approx(-5.0)
    assert restored[0].speed_mm_s == pytest.approx(7000.0)
