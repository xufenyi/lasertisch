export const WORK_AREA_SIZE_UM = 190_000;
export const BASE_PIXELS_PER_MM = 4;

export type EntityId = string;
export type Tool = 'select' | 'rectangle' | 'line' | 'pan';
export type ProcessMode =
  | 'none'
  | 'contour'
  | 'fill'
  | 'fill_then_contour'
  | 'contour_then_fill';
export type ContourDirection = 'clockwise' | 'counterclockwise';

export interface PointUm {
  xUm: number;
  yUm: number;
}

export interface ProcessSpec {
  mode: ProcessMode;
  markSpeedUmPerSec: number;
  fillAngleTenthsDeg: number;
  hatchSpacingUm: number;
  contourDirection: ContourDirection;
}

interface EntityBase {
  id: EntityId;
  name: string;
  visible: boolean;
  locked: boolean;
  process: ProcessSpec;
}

export interface RectangleEntity extends EntityBase {
  kind: 'rectangle';
  center: PointUm;
  widthUm: number;
  heightUm: number;
  rotationTenthsDeg: number;
}

export interface LineEntity extends EntityBase {
  kind: 'line';
  start: PointUm;
  end: PointUm;
}

export type EditableEntity = RectangleEntity | LineEntity;

export interface GridSettings {
  visible: boolean;
  spacingUm: number;
  snapMove: boolean;
  snapResize: boolean;
}

export interface WorkAreaSettings {
  widthUm: number;
  heightUm: number;
  center: PointUm;
}

export interface EditorDocument {
  schemaVersion: 1;
  units: 'um';
  workArea: WorkAreaSettings;
  grid: GridSettings;
  entities: EditableEntity[];
  processingOrder: EntityId[];
}

export const DEFAULT_PROCESS: ProcessSpec = {
  mode: 'contour',
  markSpeedUmPerSec: 900_000,
  fillAngleTenthsDeg: 0,
  hatchSpacingUm: 160,
  contourDirection: 'clockwise',
};

export function createEmptyDocument(): EditorDocument {
  return {
    schemaVersion: 1,
    units: 'um',
    workArea: {
      widthUm: WORK_AREA_SIZE_UM,
      heightUm: WORK_AREA_SIZE_UM,
      center: { xUm: 0, yUm: 0 },
    },
    grid: {
      visible: true,
      spacingUm: 5_000,
      snapMove: true,
      snapResize: true,
    },
    entities: [],
    processingOrder: [],
  };
}

export function createEntityId(): EntityId {
  return globalThis.crypto?.randomUUID?.() ?? `entity-${Date.now()}-${Math.random()}`;
}

