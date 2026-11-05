import { WORK_AREA_SIZE_UM, type EllipseEntity, type PointUm, type PolygonEntity } from './model';
import { isValidPolygon, polygonWorldParts } from './polygonGeometry';

export const DEFAULT_ELLIPSE_SIDES = 64;
export const MIN_ELLIPSE_SIDES = 3;
export const MAX_ELLIPSE_SIDES = 1024;

/** Ignore sub-micron trigonometric noise at half-integer sample positions. */
function sampleRound(value: number): number {
  return Math.floor(value + 0.5 + 1e-7);
}

export function ellipseLocalRing(entity: EllipseEntity): PointUm[] {
  if (!Number.isSafeInteger(entity.sides) || entity.sides < MIN_ELLIPSE_SIDES || entity.sides > MAX_ELLIPSE_SIDES) {
    throw new Error('invalid ellipse side count');
  }
  return Array.from({ length: entity.sides }, (_, i) => {
    const angle = 2 * Math.PI * i / entity.sides;
    return { xUm: sampleRound(entity.widthUm / 2 * Math.cos(angle)),
      yUm: sampleRound(entity.heightUm / 2 * Math.sin(angle)) };
  });
}

export function ellipseToPolygon(entity: EllipseEntity): PolygonEntity {
  return {
    id: entity.id, name: entity.name, process: { ...entity.process },
    kind: 'polygon', position: { ...entity.center }, rotationTenthsDeg: entity.rotationTenthsDeg,
    parts: [{ outerRing: ellipseLocalRing(entity), holes: [] }],
  };
}

export function isValidEllipse(entity: EllipseEntity): boolean {
  if (![entity.widthUm, entity.heightUm].every((value) => Number.isSafeInteger(value) && value > 0 && value <= WORK_AREA_SIZE_UM) ||
    !Number.isSafeInteger(entity.sides) || entity.sides < MIN_ELLIPSE_SIDES || entity.sides > MAX_ELLIPSE_SIDES) return false;
  return isValidPolygon(ellipseToPolygon(entity));
}

export function ellipseMinimumEdgeUm(entity: EllipseEntity): number {
  const points = polygonWorldParts(ellipseToPolygon(entity))[0].outerRing;
  let minimum = Infinity;
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    minimum = Math.min(minimum, Math.hypot(next.xUm - point.xUm, next.yUm - point.yUm));
  });
  return minimum;
}
