"""Structured failures raised at the toolpath/device boundary."""

from __future__ import annotations


class DeviceExportError(ValueError):
    def __init__(self, code: str, **parameters: str | int | float | bool | None) -> None:
        super().__init__(code)
        self.code = code
        self.parameters = parameters
