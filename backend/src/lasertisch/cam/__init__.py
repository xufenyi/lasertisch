"""GUI-independent laser toolpath planning."""

from .errors import PlanningError
from .planner import plan_document

__all__ = ["PlanningError", "plan_document"]

