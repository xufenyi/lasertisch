import { ellipseToPolygon, isValidEllipse } from './ellipseGeometry';
import { isEntityInWorkArea } from './geometry';
import {
  createEntityId,
  type EditableEntity,
  type EntityId,
  type EntityWorkspaceState,
  type PointUm,
  type RectangleEntity,
  type WorkAreaSettings,
} from './model';
import { isValidPolygon, polygonRings, polygonWorldParts } from './polygonGeometry';

export interface EntityClipboard {
  entities: EditableEntity[];
  processingOrder: EntityId[];
  sourceDocumentId: string;
  workspaceStates: Record<EntityId, EntityWorkspaceState>;
}

export interface PlacementClones {
  entities: EditableEntity[];
  processingOrder: EntityId[];
  workspaceStates: Record<EntityId, EntityWorkspaceState>;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function rectangleWorldPoints(entity: RectangleEntity): PointUm[] {
  const halfWidth = entity.widthUm / 2;
  const halfHeight = entity.heightUm / 2;
  const angle = (-entity.rotationTenthsDeg / 10) * (Math.PI / 180);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [
    [-halfWidth, -halfHeight],
    [-halfWidth, halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
  ].map(([x, y]) => ({
    xUm: entity.center.xUm + x * cosine - y * sine,
    yUm: entity.center.yUm + x * sine + y * cosine,
  }));
}

function entityWorldPoints(entity: EditableEntity): PointUm[] {
  if (entity.kind === 'line') return [entity.start, entity.end];
  if (entity.kind === 'rectangle') return rectangleWorldPoints(entity);
  const polygon = entity.kind === 'ellipse' ? ellipseToPolygon(entity) : entity;
  return polygonRings(polygonWorldParts(polygon)).flat();
}

export function entitiesWorldBounds(entities: EditableEntity[]): WorldBounds | null {
  const result = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const entity of entities) {
    for (const point of entityWorldPoints(entity)) {
      result.minX = Math.min(result.minX, point.xUm);
      result.minY = Math.min(result.minY, point.yUm);
      result.maxX = Math.max(result.maxX, point.xUm);
      result.maxY = Math.max(result.maxY, point.yUm);
    }
  }
  return Object.values(result).every(Number.isFinite) ? result : null;
}

export function placementAnchor(entities: EditableEntity[]): PointUm | null {
  const bounds = entitiesWorldBounds(entities);
  return bounds ? {
    xUm: Math.round((bounds.minX + bounds.maxX) / 2),
    yUm: Math.round((bounds.minY + bounds.maxY) / 2),
  } : null;
}

export function entitiesCanFitWorkArea(
  entities: EditableEntity[],
  workArea: WorkAreaSettings,
): boolean {
  const bounds = entitiesWorldBounds(entities);
  return Boolean(bounds) &&
    bounds!.maxX - bounds!.minX <= workArea.widthUm + 1e-7 &&
    bounds!.maxY - bounds!.minY <= workArea.heightUm + 1e-7;
}

function translatePoint(point: PointUm, dxUm: number, dyUm: number): PointUm {
  return { xUm: point.xUm + dxUm, yUm: point.yUm + dyUm };
}

export function translateEntity(
  entity: EditableEntity,
  dxUm: number,
  dyUm: number,
): EditableEntity {
  if (entity.kind === 'line') {
    return {
      ...entity,
      start: translatePoint(entity.start, dxUm, dyUm),
      end: translatePoint(entity.end, dxUm, dyUm),
    };
  }
  if (entity.kind === 'rectangle' || entity.kind === 'ellipse') {
    return { ...entity, center: translatePoint(entity.center, dxUm, dyUm) };
  }
  return { ...entity, position: translatePoint(entity.position, dxUm, dyUm) };
}

export function translateEntities(
  entities: EditableEntity[],
  dxUm: number,
  dyUm: number,
): EditableEntity[] {
  return entities.map((entity) => translateEntity(entity, dxUm, dyUm));
}

function isIntegerPoint(point: PointUm): boolean {
  return Number.isSafeInteger(point.xUm) && Number.isSafeInteger(point.yUm);
}

export function isEntityValidForPlacement(
  entity: EditableEntity,
  workArea: WorkAreaSettings,
): boolean {
  let valid = false;
  if (entity.kind === 'line') {
    valid = isIntegerPoint(entity.start) && isIntegerPoint(entity.end) &&
      (entity.start.xUm !== entity.end.xUm || entity.start.yUm !== entity.end.yUm);
  } else if (entity.kind === 'rectangle') {
    valid = isIntegerPoint(entity.center) && Number.isSafeInteger(entity.widthUm) &&
      Number.isSafeInteger(entity.heightUm) && entity.widthUm > 0 && entity.heightUm > 0 &&
      Number.isSafeInteger(entity.rotationTenthsDeg) && entity.rotationTenthsDeg >= 0 &&
      entity.rotationTenthsDeg < 3600;
  } else if (entity.kind === 'ellipse') {
    valid = isIntegerPoint(entity.center) && isValidEllipse(entity);
  } else {
    valid = isIntegerPoint(entity.position) && isValidPolygon(entity);
  }
  return valid && isEntityPositionValidForPlacement(entity, workArea);
}

/** Translation preserves topology and dimensions, so pointer previews only need position and bounds checks. */
export function isEntityPositionValidForPlacement(
  entity: EditableEntity,
  workArea: WorkAreaSettings,
): boolean {
  const coordinatesValid = entity.kind === 'line'
    ? isIntegerPoint(entity.start) && isIntegerPoint(entity.end)
    : entity.kind === 'rectangle' || entity.kind === 'ellipse'
      ? isIntegerPoint(entity.center)
      : isIntegerPoint(entity.position);
  return coordinatesValid && isEntityInWorkArea(entity, workArea);
}

export function cloneClipboardForPlacement(clipboard: EntityClipboard): PlacementClones | null {
  if (!clipboard.entities.length) return null;
  const idMap = new Map<EntityId, EntityId>();
  const entities = clipboard.entities.map((source) => {
    const id = createEntityId();
    idMap.set(source.id, id);
    return { ...structuredClone(source), id } as EditableEntity;
  });
  const processingOrder = clipboard.processingOrder
    .map((id) => idMap.get(id))
    .filter((id): id is EntityId => Boolean(id));
  if (processingOrder.length !== entities.length || new Set(processingOrder).size !== entities.length) {
    return null;
  }
  const workspaceStates = Object.fromEntries([...idMap].map(([sourceId, id]) => [
    id,
    { ...(clipboard.workspaceStates[sourceId] ?? { visible: true, locked: false }) },
  ]));
  return { entities, processingOrder, workspaceStates };
}
