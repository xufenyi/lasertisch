import logging

from lasertisch.text.diagnostics import (
    HEAD_LOGGER, NAME_LOGGER, NAME_OFFSET_MESSAGE,
    QuietFontMetadataFilter, install_font_metadata_filters,
)


def test_only_known_recoverable_metadata_messages_are_silent(caplog):
    install_font_metadata_filters()
    with caplog.at_level(logging.WARNING):
        head = logging.getLogger(HEAD_LOGGER)
        head.warning("'%s' timestamp out of range; ignoring top bytes", "created")
        head.warning("'%s' timestamp seems very low; regarding as unix timestamp", "modified")
        logging.getLogger(NAME_LOGGER).error(NAME_OFFSET_MESSAGE, 222, 224)
        head.warning("extra bytes at the end of 'head' table")
        logging.getLogger(NAME_LOGGER).error("skipping malformed name record #%d", 2)
        logging.getLogger("lasertisch.application").warning("unrelated application warning")
    assert [record.getMessage() for record in caplog.records] == [
        "extra bytes at the end of 'head' table",
        "skipping malformed name record #2",
        "unrelated application warning",
    ]


def test_filter_preserves_exceptions_and_is_idempotent(caplog):
    logger = logging.getLogger(NAME_LOGGER)
    old_level = logger.level
    install_font_metadata_filters()
    install_font_metadata_filters()
    assert sum(isinstance(item, QuietFontMetadataFilter) for item in logger.filters) == 1
    assert logger.level == old_level
    with caplog.at_level(logging.ERROR):
        try:
            raise ValueError("actual font failure")
        except ValueError:
            logger.error(NAME_OFFSET_MESSAGE, 222, 224, exc_info=True)
    assert len(caplog.records) == 1
    assert caplog.records[0].exc_info[0] is ValueError
