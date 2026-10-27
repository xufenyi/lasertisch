"""Desktop window, native dialogs, and packaged-resource integration."""

from .api import DesktopApi
from .app import find_web_entry, main

__all__ = ["DesktopApi", "find_web_entry", "main"]
