import { isEntityInWorkArea } from './geometry';
import { createEntityId, type EditableEntity, type PointUm, type PolygonEntity, type ProcessSpec, type WorkAreaSettings } from './model';
import { isValidPolygon, polygonBounds } from './polygonGeometry';

export interface PolygonVertexAddress {
  partIndex: number;
  /** Zero is the exterior; positive indices select holes. */
  ringIndex: number;
  vertexIndex: number;
}

export interface PolygonEditState {
  entityId: string;
  vertex: PolygonVertexAddress;
}

export function polygonRing(entity: PolygonEntity, address: PolygonVertexAddress): PointUm[] | null {
  const { partIndex, ringIndex, vertexIndex } = address;
  if (![partIndex, ringIndex, vertexIndex].every((index) => Number.isInteger(index) && index >= 0)) return null;
  const part = entity.parts[partIndex];
  const ring = ringIndex === 0 ? part?.outerRing : part?.holes[ringIndex - 1];
  return ring && vertexIndex < ring.length ? ring : null;
}

export function mapPolygonRing(
  entity: PolygonEntity, address: PolygonVertexAddress, update: (ring: PointUm[]) => PointUm[],
): PolygonEntity | null {
  if (!polygonRing(entity, address)) return null;
  return { ...entity, parts: entity.parts.map((part, index) => index !== address.partIndex ? part : {
    outerRing: address.ringIndex === 0 ? update(part.outerRing) : part.outerRing,
    holes: part.holes.map((ring, hole) => hole + 1 === address.ringIndex ? update(ring) : ring),
  }) };
}

export function movePolygonVertex(entity: PolygonEntity, address: PolygonVertexAddress, point: PointUm): PolygonEntity | null {
  return mapPolygonRing(entity, address, (ring) => ring.map((p, index) => index === address.vertexIndex ? point : p));
}

export function insertPolygonVertex(entity: PolygonEntity, address: PolygonVertexAddress, point?: PointUm): PolygonEntity | null {
  return mapPolygonRing(entity, address, (ring) => {
    const a = ring[address.vertexIndex], b = ring[(address.vertexIndex + 1) % ring.length];
    const inserted = point ?? { xUm: Math.round((a.xUm + b.xUm) / 2), yUm: Math.round((a.yUm + b.yUm) / 2) };
    return [...ring.slice(0, address.vertexIndex + 1), inserted, ...ring.slice(address.vertexIndex + 1)];
  });
}

export function deletePolygonVertex(entity: PolygonEntity, address: PolygonVertexAddress): PolygonEntity | null {
  const ring = polygonRing(entity, address);
  if (!ring || ring.length <= 3) return null;
  return mapPolygonRing(entity, address, (points) => points.filter((_, index) => index !== address.vertexIndex));
}

export function polygonWorldToLocal(entity: PolygonEntity, point: PointUm): PointUm {
  const angle = entity.rotationTenthsDeg * Math.PI / 1800;
  const x = point.xUm - entity.position.xUm, y = point.yUm - entity.position.yUm;
  return { xUm: Math.round(x * Math.cos(angle) - y * Math.sin(angle)),
    yUm: Math.round(x * Math.sin(angle) + y * Math.cos(angle)) };
}

export function polygonFromPoints(points: PointUm[], process: ProcessSpec, name: string, workArea: WorkAreaSettings): PolygonEntity | null {
  if (points.length < 3) return null;
  const entity: PolygonEntity = {
    id: createEntityId(), kind: 'polygon', name,
    process: { ...process }, position: { xUm: 0, yUm: 0 }, rotationTenthsDeg: 0,
    parts: [{ outerRing: points, holes: [] }],
  };
  const bounds = polygonBounds(entity);
  const position = { xUm: Math.round((bounds.minX + bounds.maxX) / 2), yUm: Math.round((bounds.minY + bounds.maxY) / 2) };
  const result = { ...entity, position, parts: [{ outerRing: points.map((p) => ({ xUm: p.xUm - position.xUm, yUm: p.yUm - position.yUm })), holes: [] }] };
  return isValidPolygon(result) && isEntityInWorkArea(result, workArea) ? result : null;
}

export function reconcilePolygonEdit(edit: PolygonEditState | null, entities: EditableEntity[]): PolygonEditState | null {
  if (!edit) return null;
  const entity = entities.find((item) => item.id === edit.entityId);
  if (!entity || entity.kind !== 'polygon') return null;
  return polygonRing(entity, edit.vertex) ? edit : { ...edit, vertex: { partIndex: 0, ringIndex: 0, vertexIndex: 0 } };
}
