import { isEntityInWorkArea } from './geometry';
import {
  type ContourDirection,
  type EditableEntity,
  type EditorDocument,
  type GlobalSettings,
  type GridSettings,
  type PointUm,
  type ProcessMode,
  type ProcessSpec,
  type WorkAreaSettings,
  WORK_AREA_SIZE_UM,
} from './model';
import { normalizeTenthsDegrees } from './units';
import { isValidPolygon, polygonBounds } from './polygonGeometry';
import { DEFAULT_ELLIPSE_SIDES, isValidEllipse } from './ellipseGeometry';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROCESS_MODES = new Set<ProcessMode>([
  'none', 'contour', 'fill', 'fill_then_contour', 'contour_then_fill',
]);
const CONTOUR_DIRECTIONS = new Set<ContourDirection>(['clockwise', 'counterclockwise']);

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = integer(value, label);
  if (parsed <= 0) throw new Error(`${label} must be positive`);
  return parsed;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function text(value: unknown, label: string, maxLength = 200): string {
  if (typeof value !== 'string' || !value.length || value.length > maxLength) {
    throw new Error(`${label} must be non-empty text`);
  }
  return value;
}

function uuid(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!UUID_PATTERN.test(parsed)) throw new Error(`${label} must be a UUID`);
  return parsed;
}

function point(value: unknown, label: string): PointUm {
  const source = record(value, label);
  return {
    xUm: integer(source.xUm, `${label}.xUm`),
    yUm: integer(source.yUm, `${label}.yUm`),
  };
}

function processSpec(value: unknown, label: string): ProcessSpec {
  const source = record(value, label);
  if (typeof source.mode !== 'string' || !PROCESS_MODES.has(source.mode as ProcessMode)) {
    throw new Error(`${label}.mode is invalid`);
  }
  if (
    typeof source.contourDirection !== 'string' ||
    !CONTOUR_DIRECTIONS.has(source.contourDirection as ContourDirection)
  ) {
    throw new Error(`${label}.contourDirection is invalid`);
  }
  return {
    mode: source.mode as ProcessMode,
    markSpeedUmPerSec: positiveInteger(source.markSpeedUmPerSec, `${label}.markSpeedUmPerSec`),
    fillAngleTenthsDeg: normalizeTenthsDegrees(integer(
      source.fillAngleTenthsDeg,
      `${label}.fillAngleTenthsDeg`,
    )),
    hatchSpacingUm: positiveInteger(source.hatchSpacingUm, `${label}.hatchSpacingUm`),
    contourDirection: source.contourDirection as ContourDirection,
  };
}

function workArea(value: unknown): WorkAreaSettings {
  const source = record(value, 'workArea');
  const result: WorkAreaSettings = {
    widthUm: positiveInteger(source.widthUm, 'workArea.widthUm'),
    heightUm: positiveInteger(source.heightUm, 'workArea.heightUm'),
    center: point(source.center, 'workArea.center'),
    origin: 'center',
  };
  if (result.widthUm > WORK_AREA_SIZE_UM || result.heightUm > WORK_AREA_SIZE_UM) {
    throw new Error('work area exceeds maximum size');
  }
  if (source.origin !== undefined && source.origin !== 'center') {
    throw new Error('workArea.origin is invalid');
  }
  return result;
}

function gridSettings(value: unknown): GridSettings {
  const source = record(value, 'grid');
  const spacingUm = positiveInteger(source.spacingUm, 'grid.spacingUm');
  if (spacingUm > WORK_AREA_SIZE_UM) throw new Error('grid spacing exceeds maximum');
  return {
    visible: booleanValue(source.visible, 'grid.visible'),
    spacingUm,
    snapMove: booleanValue(source.snapMove, 'grid.snapMove'),
    snapResize: booleanValue(source.snapResize, 'grid.snapResize'),
  };
}

function globalSettings(value: unknown): GlobalSettings {
  const source = record(value, 'globalSettings');
  if (source.minimumMarkSegmentUm !== 100 || source.initialJumpToOrigin !== true) {
    throw new Error('global settings violate fixed device-independent rules');
  }
  return {
    travelSpeedUmPerSec: positiveInteger(
      source.travelSpeedUmPerSec,
      'globalSettings.travelSpeedUmPerSec',
    ),
    minimumMarkSegmentUm: 100,
    initialJumpToOrigin: true,
  };
}

function entity(value: unknown, index: number, version: number): EditableEntity {
  const source = record(value, `entities[${index}]`);
  const base = {
    id: uuid(source.id, `entities[${index}].id`),
    name: text(source.name, `entities[${index}].name`),
    visible: booleanValue(source.visible, `entities[${index}].visible`),
    locked: booleanValue(source.locked, `entities[${index}].locked`),
    process: processSpec(source.process, `entities[${index}].process`),
  };
  if (source.kind === 'rectangle') {
    return {
      ...base,
      kind: 'rectangle',
      center: point(source.center, `entities[${index}].center`),
      widthUm: positiveInteger(source.widthUm, `entities[${index}].widthUm`),
      heightUm: positiveInteger(source.heightUm, `entities[${index}].heightUm`),
      rotationTenthsDeg: normalizeTenthsDegrees(integer(
        source.rotationTenthsDeg,
        `entities[${index}].rotationTenthsDeg`,
      )),
    };
  }
  if (source.kind === 'line') {
    if (base.process.mode !== 'none' && base.process.mode !== 'contour') {
      throw new Error(`entities[${index}] line process mode is invalid`);
    }
    const start = point(source.start, `entities[${index}].start`);
    const end = point(source.end, `entities[${index}].end`);
    if (start.xUm === end.xUm && start.yUm === end.yUm) {
      throw new Error(`entities[${index}] line has zero length`);
    }
    return { ...base, kind: 'line', start, end };
  }
  if (source.kind === 'ellipse') {
    if (version === 1) throw new Error('ellipse requires project version 2');
    const ellipse: EditableEntity = {
      ...base, kind: 'ellipse', center: point(source.center, 'ellipse.center'),
      widthUm: positiveInteger(source.widthUm, 'ellipse.widthUm'),
      heightUm: positiveInteger(source.heightUm, 'ellipse.heightUm'),
      rotationTenthsDeg: normalizeTenthsDegrees(integer(source.rotationTenthsDeg ?? 0, 'ellipse.rotationTenthsDeg')),
      sides: integer(source.sides ?? DEFAULT_ELLIPSE_SIDES, 'ellipse.sides'),
    };
    if (!isValidEllipse(ellipse)) throw new Error('invalid ellipse geometry');
    return ellipse;
  }
  if (source.kind === 'polygon') {
    if (!Array.isArray(source.parts) || !source.parts.length) throw new Error('polygon parts are required');
    const ring = (value: unknown): PointUm[] => {
      if (!Array.isArray(value) || value.length < 3) throw new Error('polygon ring is invalid');
      return value.map((p) => point(p, 'polygon vertex'));
    };
    if (version === 1 && ('position' in source || 'rotationTenthsDeg' in source)) {
      throw new Error('version 1 polygon vertices must be world coordinates');
    }
    const polygon: EditableEntity = {
      ...base, kind: 'polygon',
      position: version === 1 ? { xUm: 0, yUm: 0 } : point(source.position ?? { xUm: 0, yUm: 0 }, 'polygon.position'),
      rotationTenthsDeg: version === 1 ? 0 : normalizeTenthsDegrees(integer(source.rotationTenthsDeg ?? 0, 'polygon.rotationTenthsDeg')),
      parts: source.parts.map((rawPart) => {
        const part = record(rawPart, 'polygon part');
        const holes = part.holes ?? [];
        if (!Array.isArray(holes)) throw new Error('polygon holes must be an array');
        return { outerRing: ring(part.outerRing), holes: holes.map(ring) };
      }),
    };
    if (version === 1) {
      const bounds = polygonBounds(polygon);
      const x = Math.round((bounds.minX + bounds.maxX) / 2), y = Math.round((bounds.minY + bounds.maxY) / 2);
      const translate = (p: PointUm): PointUm => ({ xUm: p.xUm - x, yUm: p.yUm - y });
      polygon.position = { xUm: x, yUm: y };
      polygon.parts = polygon.parts.map((part) => ({ outerRing: part.outerRing.map(translate), holes: part.holes.map((ring) => ring.map(translate)) }));
    }
    if (!isValidPolygon(polygon)) throw new Error('polygon topology is invalid');
    return polygon;
  }
  throw new Error(`entities[${index}].kind is unsupported`);
}

export function parseProjectDocument(sourceText: string): EditorDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(sourceText);
  } catch {
    throw new Error('project is not valid JSON');
  }
  const source = record(raw, 'project');
  if ((source.schemaVersion !== 1 && source.schemaVersion !== 2) || source.units !== 'um') {
    throw new Error('unsupported project schema');
  }
  if (!Array.isArray(source.entities) || !Array.isArray(source.processingOrder)) {
    throw new Error('entities and processingOrder must be arrays');
  }
  const parsedWorkArea = workArea(source.workArea);
  const entities = source.entities.map((item, index) => entity(item, index, source.schemaVersion as number));
  const entityIds = entities.map((item) => item.id);
  if (new Set(entityIds).size !== entityIds.length) throw new Error('entity ids must be unique');
  const processingOrder = source.processingOrder.map((id, index) => uuid(id, `processingOrder[${index}]`));
  if (
    processingOrder.length !== entityIds.length ||
    new Set(processingOrder).size !== processingOrder.length ||
    processingOrder.some((id) => !entityIds.includes(id))
  ) {
    throw new Error('processingOrder must contain every entity exactly once');
  }
  if (!entities.every((item) => isEntityInWorkArea(item, parsedWorkArea))) {
    throw new Error('geometry lies outside the work area');
  }
  return {
    schemaVersion: 2,
    documentId: uuid(source.documentId, 'documentId'),
    projectName: text(source.projectName, 'projectName'),
    units: 'um',
    workArea: parsedWorkArea,
    grid: gridSettings(source.grid),
    defaultProcess: processSpec(source.defaultProcess, 'defaultProcess'),
    globalSettings: globalSettings(source.globalSettings),
    entities,
    processingOrder,
  };
}

export function serializeProjectDocument(document: EditorDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function projectFilename(projectName: string): string {
  const safeName = projectName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || 'LaserTisch';
  return `${safeName}.lasertisch.json`;
}
