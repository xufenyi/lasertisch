import {
  BASE_PIXELS_PER_MM,
  type LineEntity,
  type PointUm,
  type RectangleEntity,
  type WorkAreaSettings,
  type EditableEntity,
} from './model';
import { polygonRings, polygonWorldParts } from './polygonGeometry';

export interface ScenePoint {
  x: number;
  y: number;
}

export function constrainDrawingEnd(
  tool: 'rectangle' | 'line',
  start: PointUm,
  current: PointUm,
  shift: boolean,
): PointUm {
  if (!shift) return current;
  const dx = current.xUm - start.xUm;
  const dy = current.yUm - start.yUm;
  if (tool === 'rectangle') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return {
      xUm: start.xUm + (dx < 0 ? -side : side),
      yUm: start.yUm + (dy < 0 ? -side : side),
    };
  }
  const angle = Math.atan2(dy, dx);
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return {
    xUm: Math.round(start.xUm + Math.cos(snappedAngle) * length),
    yUm: Math.round(start.yUm + Math.sin(snappedAngle) * length),
  };
}

export function rectangleCenterForFixedResizeAnchor(
  entity: RectangleEntity,
  widthUm: number,
  heightUm: number,
  draggedCorner: string,
): PointUm {
  const anchorFactors: Record<string, [number, number]> = {
    tl: [1, -1], tr: [-1, -1], bl: [1, 1], br: [-1, 1],
    ml: [1, 0], mr: [-1, 0], mt: [0, -1], mb: [0, 1],
  };
  const factors = anchorFactors[draggedCorner];
  if (!factors) return entity.center;
  const angle = (-entity.rotationTenthsDeg / 10) * (Math.PI / 180);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const rotate = (x: number, y: number) => ({
    x: x * cosine - y * sine,
    y: x * sine + y * cosine,
  });
  const oldOffset = rotate(
    factors[0] * entity.widthUm / 2,
    factors[1] * entity.heightUm / 2,
  );
  const anchor = {
    x: entity.center.xUm + oldOffset.x,
    y: entity.center.yUm + oldOffset.y,
  };
  const newOffset = rotate(factors[0] * widthUm / 2, factors[1] * heightUm / 2);
  return {
    xUm: Math.round(anchor.x - newOffset.x),
    yUm: Math.round(anchor.y - newOffset.y),
  };
}

export function gridLineCoordinates(
  minUm: number,
  maxUm: number,
  spacingUm: number,
  maximumLines = 500,
): number[] {
  const estimated = Math.max(0, Math.floor((maxUm - minUm) / spacingUm) + 1);
  const stride = Math.max(1, Math.ceil(estimated / maximumLines));
  const renderedSpacing = spacingUm * stride;
  const coordinates: number[] = [];
  for (
    let coordinate = Math.ceil(minUm / renderedSpacing) * renderedSpacing;
    coordinate <= maxUm;
    coordinate += renderedSpacing
  ) {
    if (coordinate !== 0 && coordinate > minUm && coordinate < maxUm) {
      coordinates.push(coordinate);
    }
  }
  return coordinates;
}

export function workAreaSceneSize(workArea: WorkAreaSettings): ScenePoint {
  return {
    x: (workArea.widthUm / 1000) * BASE_PIXELS_PER_MM,
    y: (workArea.heightUm / 1000) * BASE_PIXELS_PER_MM,
  };
}

export function worldToScene(point: PointUm, workArea: WorkAreaSettings): ScenePoint {
  const leftUm = workArea.center.xUm - workArea.widthUm / 2;
  const topUm = workArea.center.yUm + workArea.heightUm / 2;
  return {
    x: ((point.xUm - leftUm) / 1000) * BASE_PIXELS_PER_MM,
    y: ((topUm - point.yUm) / 1000) * BASE_PIXELS_PER_MM,
  };
}

export function sceneToWorld(point: ScenePoint, workArea: WorkAreaSettings): PointUm {
  const leftUm = workArea.center.xUm - workArea.widthUm / 2;
  const topUm = workArea.center.yUm + workArea.heightUm / 2;
  return {
    xUm: Math.round(leftUm + (point.x / BASE_PIXELS_PER_MM) * 1000),
    yUm: Math.round(topUm - (point.y / BASE_PIXELS_PER_MM) * 1000),
  };
}

export function clampPoint(point: PointUm, workArea: WorkAreaSettings): PointUm {
  const halfWidth = workArea.widthUm / 2;
  const halfHeight = workArea.heightUm / 2;
  return {
    xUm: Math.max(
      workArea.center.xUm - halfWidth,
      Math.min(workArea.center.xUm + halfWidth, point.xUm),
    ),
    yUm: Math.max(
      workArea.center.yUm - halfHeight,
      Math.min(workArea.center.yUm + halfHeight, point.yUm),
    ),
  };
}

export function snapValue(valueUm: number, spacingUm: number): number {
  return Math.round(valueUm / spacingUm) * spacingUm;
}

export function snapPoint(
  point: PointUm,
  spacingUm: number,
  workArea: WorkAreaSettings,
): PointUm {
  return clampPoint({
    xUm: snapValue(point.xUm, spacingUm),
    yUm: snapValue(point.yUm, spacingUm),
  }, workArea);
}

/** Rectangle centres may lie halfway between grid lines (odd cell dimensions). */
export function snapRectangleCenter(
  point: PointUm,
  spacingUm: number,
  workArea: WorkAreaSettings,
): PointUm {
  const snapped = snapPoint(point, spacingUm / 2, workArea);
  // Canonical coordinates remain integer micrometres, even for odd grid spacing.
  return { xUm: Math.round(snapped.xUm), yUm: Math.round(snapped.yUm) };
}

export function isPointInWorkArea(point: PointUm, workArea: WorkAreaSettings): boolean {
  const halfWidth = workArea.widthUm / 2;
  const halfHeight = workArea.heightUm / 2;
  return (
    point.xUm >= workArea.center.xUm - halfWidth &&
    point.xUm <= workArea.center.xUm + halfWidth &&
    point.yUm >= workArea.center.yUm - halfHeight &&
    point.yUm <= workArea.center.yUm + halfHeight
  );
}

export function isRectangleInWorkArea(
  rectangle: RectangleEntity,
  workArea: WorkAreaSettings,
): boolean {
  const halfWidth = rectangle.widthUm / 2;
  const halfHeight = rectangle.heightUm / 2;
  const angle = (-rectangle.rotationTenthsDeg / 10) * (Math.PI / 180);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    [-halfWidth, -halfHeight],
    [-halfWidth, halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
  ].every(([localX, localY]) => {
    const x = rectangle.center.xUm + localX * cosine - localY * sine;
    const y = rectangle.center.yUm + localX * sine + localY * cosine;
    return isPointInWorkArea({ xUm: x, yUm: y }, workArea);
  });
}

export function isEntityInWorkArea(
  entity: EditableEntity,
  workArea: WorkAreaSettings,
): boolean {
  if (entity.kind === 'rectangle') return isRectangleInWorkArea(entity, workArea);
  if (entity.kind === 'polygon') {
    return polygonRings(polygonWorldParts(entity)).every((ring) => ring.every((point) => isPointInWorkArea(point, workArea)));
  }
  return isPointInWorkArea(entity.start, workArea) && isPointInWorkArea(entity.end, workArea);
}

