import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
EXPECTED_LOCALES = {"zh-CN", "en", "fr", "de", "ko"}


def test_language_packs_have_the_same_message_keys() -> None:
    packs: dict[str, dict[str, object]] = {}
    for path in sorted((PROJECT_ROOT / "locales").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        locale = data["_meta"]["locale"]
        assert locale == path.stem
        assert data["_meta"]["version"] == 1
        assert isinstance(data["messages"], dict)
        packs[locale] = data

    assert set(packs) == EXPECTED_LOCALES
    chinese_keys = set(packs["zh-CN"]["messages"])
    for locale, pack in packs.items():
        assert set(pack["messages"]) == chinese_keys, locale

