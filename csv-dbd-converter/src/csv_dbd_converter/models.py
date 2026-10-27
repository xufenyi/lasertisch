"""转换器使用的数据模型。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


MotionKind = Literal["jump", "mark"]


@dataclass(frozen=True)
class MotionCommand:
    """表示一条绝对坐标运动命令。

    Attributes:
        kind: 运动类型；``jump`` 表示不出激光，``mark`` 表示出激光。
        x_mm: 目标点 X 坐标，单位为毫米。
        y_mm: 目标点 Y 坐标，单位为毫米。
        speed_mm_s: 本次运动的目标速度，单位为毫米每秒。
    """

    kind: MotionKind
    x_mm: float
    y_mm: float
    speed_mm_s: float
