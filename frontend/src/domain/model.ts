export const WORK_AREA_SIZE_UM = 190_000;
export const BASE_PIXELS_PER_MM = 4;

export type EntityId = string;
export type Tool = 'select' | 'rectangle' | 'line' | 'polygon' | 'ellipse' | 'text' | 'pan';
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
  process: ProcessSpec;
}

/** View and edit protection for one entity in the current editor workspace only. */
export interface EntityWorkspaceState {
  visible: boolean;
  locked: boolean;
}

export const DEFAULT_ENTITY_WORKSPACE_STATE: Readonly<EntityWorkspaceState> = Object.freeze({
  visible: true,
  locked: false,
});

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

export interface EllipseEntity extends EntityBase {
  kind: 'ellipse';
  center: PointUm;
  widthUm: number;
  heightUm: number;
  rotationTenthsDeg: number;
  sides: number;
}

export interface PolygonPart {
  outerRing: PointUm[];
  holes: PointUm[][];
}

export interface PolygonEntity extends EntityBase {
  kind: 'polygon';
  /** World position of the local origin; vertices remain in local coordinates. */
  position: PointUm;
  rotationTenthsDeg: number;
  parts: PolygonPart[];
}

export interface TextEntity extends Omit<PolygonEntity, 'kind'> {
  kind: 'text';
  text: import('./text').TextSource;
  generatorVersion: 'font-outline-v1';
  engineVersions: Record<string,string>;
}

export type PolygonShape = PolygonEntity | TextEntity;
export type EditableEntity = RectangleEntity | LineEntity | PolygonEntity | EllipseEntity | TextEntity;

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
  origin?: 'center';
}

export interface GlobalSettings {
  travelSpeedUmPerSec: number;
  minimumMarkSegmentUm: 100;
  initialJumpToOrigin: true;
}

export interface EditorDocument {
  schemaVersion: 2;
  documentId: string;
  projectName: string;
  units: 'um';
  workArea: WorkAreaSettings;
  grid: GridSettings;
  defaultProcess: ProcessSpec;
  globalSettings: GlobalSettings;
  entities: EditableEntity[];
  processingOrder: EntityId[];
}

export const DEFAULT_PROCESS: ProcessSpec = {
  mode: 'contour',
  markSpeedUmPerSec: 900_000,
  fillAngleTenthsDeg: 0,
  hatchSpacingUm: 80,
  contourDirection: 'clockwise',
};

export function createEmptyDocument(projectName = 'Untitled project'): EditorDocument {
  return {
    schemaVersion: 2,
    documentId: createEntityId(),
    projectName,
    units: 'um',
    workArea: {
      widthUm: WORK_AREA_SIZE_UM,
      heightUm: WORK_AREA_SIZE_UM,
      center: { xUm: 0, yUm: 0 },
      origin: 'center',
    },
    grid: {
      visible: true,
      spacingUm: 5_000,
      snapMove: true,
      snapResize: true,
    },
    defaultProcess: { ...DEFAULT_PROCESS },
    globalSettings: {
      travelSpeedUmPerSec: 10_000_000,
      minimumMarkSegmentUm: 100,
      initialJumpToOrigin: true,
    },
    entities: [],
    processingOrder: [],
  };
}

export function createEntityId(): EntityId {
  return globalThis.crypto?.randomUUID?.() ?? `entity-${Date.now()}-${Math.random()}`;
}

