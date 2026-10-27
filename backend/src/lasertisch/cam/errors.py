"""Structured errors raised by the CAM planner."""

from __future__ import annotations


class PlanningError(ValueError):
    def __init__(self, code: str, **parameters: object) -> None:
        self.code = code
        self.parameters = parameters
        detail = ", ".join(f"{key}={value!r}" for key, value in parameters.items())
        super().__init__(f"{code}: {detail}" if detail else code)

