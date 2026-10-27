import type { PointUm, PolygonEntity, PolygonPart } from './model';

export function polygonRings(parts: PolygonPart[]): PointUm[][] {
  return parts.flatMap((part) => [part.outerRing, ...part.holes]);
}

export function polygonBounds(entity: PolygonEntity) {
  const points = entity.parts.flatMap((part) => part.outerRing);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.xUm); maxX = Math.max(maxX, point.xUm);
    minY = Math.min(minY, point.yUm); maxY = Math.max(maxY, point.yUm);
  }
  return { minX, minY, maxX, maxY, widthUm: maxX - minX, heightUm: maxY - minY };
}

/** Clockwise angles in a world with positive Y pointing upwards. */
export function polygonWorldPoint(entity: PolygonEntity, point: PointUm): PointUm {
  const angle = -entity.rotationTenthsDeg * Math.PI / 1800;
  return {
    xUm: entity.position.xUm + Math.round(point.xUm * Math.cos(angle) - point.yUm * Math.sin(angle)),
    yUm: entity.position.yUm + Math.round(point.xUm * Math.sin(angle) + point.yUm * Math.cos(angle)),
  };
}

export function polygonWorldParts(entity: PolygonEntity): PolygonPart[] {
  return entity.parts.map((part) => ({
    outerRing: part.outerRing.map((point) => polygonWorldPoint(entity, point)),
    holes: part.holes.map((ring) => ring.map((point) => polygonWorldPoint(entity, point))),
  }));
}

export function resizePolygon(entity: PolygonEntity, widthUm: number, heightUm: number): PolygonEntity {
  const bounds = polygonBounds(entity);
  if (widthUm <= 0 || heightUm <= 0 || !bounds.widthUm || !bounds.heightUm) {
    throw new Error('invalid polygon size');
  }
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const scale = (point: PointUm): PointUm => ({
    xUm: Math.round(centerX + (point.xUm - centerX) * widthUm / bounds.widthUm),
    yUm: Math.round(centerY + (point.yUm - centerY) * heightUm / bounds.heightUm),
  });
  return {
    ...entity,
    parts: entity.parts.map((part) => ({
      outerRing: part.outerRing.map(scale), holes: part.holes.map((ring) => ring.map(scale)),
    })),
  };
}

function cross(a: PointUm, b: PointUm, c: PointUm): number {
  return (b.xUm - a.xUm) * (c.yUm - a.yUm) - (b.yUm - a.yUm) * (c.xUm - a.xUm);
}

function same(a: PointUm, b: PointUm): boolean {
  return a.xUm === b.xUm && a.yUm === b.yUm;
}

function onSegment(a: PointUm, b: PointUm, p: PointUm): boolean {
  return cross(a, b, p) === 0 &&
    p.xUm >= Math.min(a.xUm, b.xUm) && p.xUm <= Math.max(a.xUm, b.xUm) &&
    p.yUm >= Math.min(a.yUm, b.yUm) && p.yUm <= Math.max(a.yUm, b.yUm);
}

type Intersection = 'none' | 'point' | 'cross' | 'overlap';
function intersection(a: PointUm, b: PointUm, c: PointUm, d: PointUm): Intersection {
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  if (Math.sign(abC) * Math.sign(abD) < 0 && Math.sign(cdA) * Math.sign(cdB) < 0) return 'cross';
  if (abC === 0 && abD === 0) {
    const axis = a.xUm === b.xUm ? 'yUm' : 'xUm';
    const low = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]));
    const high = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
    return high > low ? 'overlap' : high === low ? 'point' : 'none';
  }
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b)
    ? 'point' : 'none';
}

/** -1 outside, 0 on boundary, 1 inside. */
function ringLocation(point: PointUm, ring: PointUm[]): number {
  let inside = false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (onSegment(a, b, point)) return 0;
    if ((a.yUm > point.yUm) !== (b.yUm > point.yUm) &&
      point.xUm < (b.xUm - a.xUm) * (point.yUm - a.yUm) / (b.yUm - a.yUm) + a.xUm) inside = !inside;
  }
  return inside ? 1 : -1;
}

function ringsIntersect(a: PointUm[], b: PointUm[], allowPointTouch = false): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const kind = intersection(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]);
      if (kind !== 'none' && !(allowPointTouch && kind === 'point')) return true;
    }
  }
  return false;
}

function signedArea(ring: PointUm[]): number {
  // Translate to the first vertex so large world offsets do not cancel area.
  const origin = ring[0];
  let doubled = 0;
  for (let i = 1; i < ring.length - 1; i++) doubled += cross(origin, ring[i], ring[i + 1]);
  return doubled / 2;
}

function validRing(ring: PointUm[]): boolean {
  if (ring.length < 3 || ring.some((p) => !Number.isSafeInteger(p.xUm) || !Number.isSafeInteger(p.yUm)) ||
    signedArea(ring) === 0) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    if (same(a, b)) return false;
    for (let j = i + 1; j < ring.length; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === ring.length - 1);
      const kind = intersection(a, b, ring[j], ring[(j + 1) % ring.length]);
      if (kind !== 'none' && !(adjacent && kind === 'point')) return false;
    }
  }
  return true;
}

function insidePart(point: PointUm, part: PolygonPart): boolean {
  return ringLocation(point, part.outerRing) === 1 &&
    part.holes.every((hole) => ringLocation(point, hole) === -1);
}

function partsValid(parts: PolygonPart[]): boolean {
  if (!parts.length || !polygonRings(parts).every(validRing)) return false;
  for (const part of parts) {
    for (let i = 0; i < part.holes.length; i++) {
      const hole = part.holes[i];
      if (ringLocation(hole[0], part.outerRing) !== 1 || ringsIntersect(hole, part.outerRing)) return false;
      for (const other of part.holes.slice(i + 1)) {
        if (ringsIntersect(hole, other) || ringLocation(hole[0], other) !== -1 ||
          ringLocation(other[0], hole) !== -1) return false;
      }
    }
  }
  for (let i = 0; i < parts.length; i++) {
    for (const other of parts.slice(i + 1)) {
      const part = parts[i];
      for (const a of [part.outerRing, ...part.holes]) {
        for (const b of [other.outerRing, ...other.holes]) {
          if (ringsIntersect(a, b, true)) return false;
        }
      }
      for (const [a, b] of [[part, other], [other, part]]) {
        const ring = a.outerRing;
        if (ring.some((p, index) => insidePart(p, b) || insidePart({
          xUm: (p.xUm + ring[(index + 1) % ring.length].xUm) / 2,
          yUm: (p.yUm + ring[(index + 1) % ring.length].yUm) / 2,
        }, b))) return false;
      }
    }
  }
  return true;
}

export function isValidPolygon(entity: PolygonEntity): boolean {
  return Number.isSafeInteger(entity.position.xUm) && Number.isSafeInteger(entity.position.yUm) &&
    Number.isSafeInteger(entity.rotationTenthsDeg) && entity.rotationTenthsDeg >= 0 &&
    entity.rotationTenthsDeg < 3600 && partsValid(entity.parts) && partsValid(polygonWorldParts(entity));
}

export function polygonStatistics(entity: PolygonEntity) {
  const parts = polygonWorldParts(entity);
  const rings = polygonRings(parts);
  const areaUm2 = parts.reduce((sum, part) => sum + Math.abs(signedArea(part.outerRing)) -
    part.holes.reduce((holes, ring) => holes + Math.abs(signedArea(ring)), 0), 0);
  let perimeterUm = 0;
  for (const ring of rings) {
    ring.forEach((point, i) => {
      const next = ring[(i + 1) % ring.length];
      perimeterUm += Math.hypot(next.xUm - point.xUm, next.yUm - point.yUm);
    });
  }
  return { parts: parts.length, holes: parts.reduce((n, part) => n + part.holes.length, 0),
    vertices: rings.reduce((n, ring) => n + ring.length, 0), areaUm2, perimeterUm };
}
