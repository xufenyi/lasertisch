from pathlib import Path

import pytest

from csv_dbd_converter.cli import main


CSV_CONTENT = "command,x,y,speed\njump,0,0,7000\nmark,10,5,500\n"


def write_csv(path: Path) -> None:
    path.write_text(CSV_CONTENT, encoding="utf-8")


def test_encode_and_decode_with_default_outputs(tmp_path: Path) -> None:
    csv_path = tmp_path / "motion.csv"
    write_csv(csv_path)

    assert main(["encode", str(csv_path)]) == 0
    dbd_path = tmp_path / "motion.dbd"
    assert dbd_path.is_file()

    csv_path.unlink()
    assert main(["decode", str(dbd_path)]) == 0
    assert csv_path.read_text(encoding="utf-8").startswith("command,x,y,speed\n")


@pytest.mark.parametrize("option", ["-o", "--output"])
def test_explicit_output_option(tmp_path: Path, option: str) -> None:
    source = tmp_path / "input.csv"
    target = tmp_path / "chosen.dbd"
    write_csv(source)

    assert main(["encode", str(source), option, str(target)]) == 0
    assert target.is_file()
    assert not (tmp_path / "input.dbd").exists()


def test_program_expands_wildcard_for_batch_conversion(tmp_path: Path) -> None:
    write_csv(tmp_path / "a.csv")
    write_csv(tmp_path / "b.CSV")

    assert main(["encode", str(tmp_path / "*.csv")]) == 0

    assert (tmp_path / "a.dbd").is_file()
    assert (tmp_path / "b.dbd").is_file()


def test_shell_expanded_multiple_inputs_are_supported(tmp_path: Path) -> None:
    first = tmp_path / "a.csv"
    second = tmp_path / "b.csv"
    write_csv(first)
    write_csv(second)

    assert main(["encode", str(first), str(second)]) == 0
    assert (tmp_path / "a.dbd").is_file()
    assert (tmp_path / "b.dbd").is_file()


def test_output_option_rejects_multiple_inputs(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    first = tmp_path / "a.csv"
    second = tmp_path / "b.csv"
    write_csv(first)
    write_csv(second)

    result = main(
        ["encode", str(first), str(second), "-o", str(tmp_path / "one.dbd")]
    )

    assert result == 1
    assert "只能与单个输入文件" in capsys.readouterr().err


@pytest.mark.parametrize(
    ("arguments", "message"),
    [
        (["encode", "input.txt"], "输入文件必须使用.csv扩展名"),
        (["decode", "input.csv"], "输入文件必须使用.dbd扩展名"),
    ],
)
def test_input_extension_is_validated_before_reading(
    arguments: list[str],
    message: str,
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert main(arguments) == 1
    assert message in capsys.readouterr().err


def test_output_extension_is_validated(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = tmp_path / "input.csv"
    write_csv(source)

    assert main(["encode", str(source), "-o", str(tmp_path / "bad.csv")]) == 1
    assert "输出文件必须使用.dbd扩展名" in capsys.readouterr().err


def test_unmatched_wildcard_is_an_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main(["encode", str(tmp_path / "*.csv")]) == 1
    assert "通配符没有匹配任何文件" in capsys.readouterr().err


def test_legacy_positional_output_is_rejected(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = tmp_path / "input.csv"
    write_csv(source)

    assert main(["encode", str(source), str(tmp_path / "output.dbd")]) == 1
    assert "输入文件必须使用.csv扩展名" in capsys.readouterr().err
