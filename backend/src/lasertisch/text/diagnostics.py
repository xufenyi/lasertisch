"""Silence known recoverable metadata diagnostics without hiding font failures."""
import logging


HEAD_LOGGER = "fontTools.ttLib.tables._h_e_a_d"
NAME_LOGGER = "fontTools.ttLib.tables._n_a_m_e"
TIMESTAMP_MESSAGES = {
    "'%s' timestamp out of range; ignoring top bytes",
    "'%s' timestamp seems very low; regarding as unix timestamp",
}
NAME_OFFSET_MESSAGE = "'name' table stringOffset incorrect. Expected: %s; Actual: %s"


class QuietFontMetadataFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # Exceptions, other tables, and every other diagnostic remain visible.
        if record.exc_info:
            return True
        if record.name == HEAD_LOGGER and record.levelno == logging.WARNING:
            if isinstance(record.msg, str) and record.msg in TIMESTAMP_MESSAGES and record.args in (("created",), ("modified",)):
                return False
        if record.name == NAME_LOGGER and record.levelno == logging.ERROR:
            if record.msg == NAME_OFFSET_MESSAGE:
                return False
        return True


def install_font_metadata_filters() -> None:
    for name in (HEAD_LOGGER, NAME_LOGGER):
        logger = logging.getLogger(name)
        if not any(isinstance(item, QuietFontMetadataFilter) for item in logger.filters):
            logger.addFilter(QuietFontMetadataFilter())
