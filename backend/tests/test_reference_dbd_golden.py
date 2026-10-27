from pathlib import Path
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONVERTER_SOURCE = PROJECT_ROOT / "csv-dbd-converter" / "src"
sys.path.insert(0, str(CONVERTER_SOURCE))

from csv_dbd_converter.csv_io import read_motion_csv  # noqa: E402
from csv_dbd_converter.dbd_codec import encode_dbd  # noqa: E402


def test_reference_csv_encodes_to_the_supplied_dbd_byte_for_byte() -> None:
    csv_path = PROJECT_ROOT / "csv_dbd" / "test.csv"
    dbd_path = PROJECT_ROOT / "csv_dbd" / "test.dbd"

    assert encode_dbd(read_motion_csv(csv_path)) == dbd_path.read_bytes()

