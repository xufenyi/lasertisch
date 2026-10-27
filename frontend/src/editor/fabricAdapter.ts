import {
  ActiveSelection,
  controlsUtils,
  FabricObject,
  Line,
  Point,
  Polyline,
  Rect,
  util,
} from 'fabric';

import {
  BASE_PIXELS_PER_MM,
  type EditableEntity,
  type GridSettings,
  type LineEntity,
  type PointUm,
  type RectangleEntity,
  type WorkAreaSettings,
} from '../domain/model';
import {
  isPointInWorkArea,
  isRectangleInWorkArea,
  gridLineCoordinates,
  rectangleCenterForFixedResizeAnchor,
  sceneToWorld,
  snapPoint,
  snapRectangleCenter,
  snapValue,
  workAreaSceneSize,
  worldToScene,
} from '../domain/geometry';
import { normalizeTenthsDegrees } from '../domain/units';

interface EntityData {
  entityId?: string;
  role?: 'work-area' | 'grid' | 'axis';
  screenStrokeWidthPx?: number;
}

export const RECTANGLE_STROKE_PX = 0.65;
export const LINE_STROKE_PX = 0.75;
const REFERENCE_STROKE_PX = 0.55;

export interface ProjectionOptions {
  snapMove?: boolean;
  snapResize?: boolean;
  resizeCorner?: string;
}

type AnnotatedFabricObject = FabricObject & EntityData;

export function getEntityId(object: FabricObject): string | undefined {
  return (object as AnnotatedFabricObject).entityId;
}

export function snapObjectCenterForMove(
  object: FabricObject,
  center: PointUm,
  spacingUm: number,
  workArea: WorkAreaSettings,
): PointUm {
  return object instanceof Rect || object instanceof ActiveSelection
    ? snapRectangleCenter(center, spacingUm, workArea)
    : snapPoint(center, spacingUm, workArea);
}

function setEntityId(object: FabricObject, id: string): void {
  (object as AnnotatedFabricObject).entityId = id;
}

function referenceLine(points: [number, number, number, number], role: 'grid' | 'axis', zoom: number): Line {
  const line = new Line(points, {
    stroke: role === 'axis' ? '#a9b8c4' : '#dce4ea',
    strokeWidth: REFERENCE_STROKE_PX / zoom,
    strokeUniform: true,
    objectCaching: false,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  (line as AnnotatedFabricObject).role = role;
  (line as AnnotatedFabricObject).screenStrokeWidthPx = REFERENCE_STROKE_PX;
  return line;
}

export function createReferenceObjects(
  grid: GridSettings,
  settings: WorkAreaSettings,
  zoom = 1,
): FabricObject[] {
  const size = workAreaSceneSize(settings);
  const origin = worldToScene({ xUm: 0, yUm: 0 }, settings);
  const workArea = new Rect({
    left: 0,
    top: 0,
    width: size.x,
    height: size.y,
    originX: 'left',
    originY: 'top',
    fill: '#f8fbfd',
    stroke: '#91a4b2',
    strokeWidth: REFERENCE_STROKE_PX / zoom,
    strokeUniform: true,
    objectCaching: false,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  });
  (workArea as AnnotatedFabricObject).role = 'work-area';
  (workArea as AnnotatedFabricObject).screenStrokeWidthPx = REFERENCE_STROKE_PX;
  const references: FabricObject[] = [workArea];
  if (grid.visible) {
    const minX = settings.center.xUm - settings.widthUm / 2;
    const maxX = settings.center.xUm + settings.widthUm / 2;
    const minY = settings.center.yUm - settings.heightUm / 2;
    const maxY = settings.center.yUm + settings.heightUm / 2;
    for (const xUm of gridLineCoordinates(minX, maxX, grid.spacingUm)) {
      const x = worldToScene({ xUm, yUm: 0 }, settings).x;
      references.push(referenceLine([x, 0, x, size.y], 'grid', zoom));
    }
    for (const yUm of gridLineCoordinates(minY, maxY, grid.spacingUm)) {
      const y = worldToScene({ xUm: 0, yUm }, settings).y;
      references.push(referenceLine([0, y, size.x, y], 'grid', zoom));
    }
  }
  if (origin.x >= 0 && origin.x <= size.x) {
    references.push(referenceLine([origin.x, 0, origin.x, size.y], 'axis', zoom));
  }
  if (origin.y >= 0 && origin.y <= size.y) {
    references.push(referenceLine([0, origin.y, size.x, origin.y], 'axis', zoom));
  }
  return references;
}

function rectangleObject(
  entity: RectangleEntity,
  workArea: WorkAreaSettings,
  zoom: number,
): Rect {
  const center = worldToScene(entity.center, workArea);
  const object = new Rect({
    left: center.x,
    top: center.y,
    width: (entity.widthUm / 1000) * BASE_PIXELS_PER_MM,
    height: (entity.heightUm / 1000) * BASE_PIXELS_PER_MM,
    angle: entity.rotationTenthsDeg / 10,
    originX: 'center',
    originY: 'center',
    fill: 'rgba(39, 120, 194, 0.13)',
    stroke: '#1666a7',
    strokeWidth: RECTANGLE_STROKE_PX / zoom,
    strokeUniform: true,
    objectCaching: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#1666a7',
    transparentCorners: false,
    lockScalingFlip: true,
    activeOn: 'down',
    snapAngle: 0.1,
    snapThreshold: 0.05,
  });
  setEntityId(object, entity.id);
  (object as AnnotatedFabricObject).screenStrokeWidthPx = RECTANGLE_STROKE_PX;
  return object;
}

function lineObject(entity: LineEntity, workArea: WorkAreaSettings, zoom: number): Polyline {
  const start = worldToScene(entity.start, workArea);
  const end = worldToScene(entity.end, workArea);
  const object = new Polyline([start, end], {
    originX: 'center',
    originY: 'center',
    fill: 'transparent',
    stroke: '#d84315',
    strokeWidth: LINE_STROKE_PX / zoom,
    strokeUniform: true,
    objectCaching: false,
    padding: 6,
    perPixelTargetFind: true,
    transparentCorners: false,
    cornerColor: '#ffffff',
    cornerStrokeColor: '#d84315',
    hasBorders: false,
    lockScalingFlip: true,
    activeOn: 'down',
    hoverCursor: 'move',
    moveCursor: 'move',
  });
  object.controls = controlsUtils.createPolyControls(object);
  setEntityId(object, entity.id);
  (object as AnnotatedFabricObject).screenStrokeWidthPx = LINE_STROKE_PX;
  object.setCoords();
  return object;
}

export function entityToFabricObject(
  entity: EditableEntity,
  workArea: WorkAreaSettings,
  zoom = 1,
): FabricObject {
  const object = entity.kind === 'rectangle'
    ? rectangleObject(entity, workArea, zoom)
    : lineObject(entity, workArea, zoom);
  object.visible = entity.visible;
  object.selectable = !entity.locked;
  object.evented = !entity.locked;
  object.hoverCursor = 'move';
  object.moveCursor = 'move';
  return object;
}

export function updateScreenStrokeWidths(
  objects: FabricObject[],
  zoom: number,
): void {
  const safeZoom = Math.max(0.0001, zoom);
  for (const object of objects) {
    const annotated = object as AnnotatedFabricObject;
    if (annotated.screenStrokeWidthPx !== undefined) {
      const strokeWidth = annotated.screenStrokeWidthPx / safeZoom;
      if (Math.abs(object.strokeWidth - strokeWidth) > 1e-6) {
        object.set('strokeWidth', strokeWidth);
        object.dirty = true;
      }
    }
  }
}

function transformedCenter(object: FabricObject): Point {
  return util.transformPoint(new Point(0, 0), object.calcTransformMatrix());
}

function fabricRectangleToEntity(
  object: FabricObject,
  entity: RectangleEntity,
  grid: GridSettings,
  workArea: WorkAreaSettings,
  options: ProjectionOptions,
): RectangleEntity | null {
  const centerScene = transformedCenter(object);
  let center = sceneToWorld(centerScene, workArea);
  if (options.snapMove ?? grid.snapMove) {
    center = snapRectangleCenter(center, grid.spacingUm, workArea);
  }
  const decomposition = util.qrDecompose(object.calcTransformMatrix());
  let widthUm = Math.max(
    1,
    Math.round((object.width * Math.abs(decomposition.scaleX) * 1000) / BASE_PIXELS_PER_MM),
  );
  let heightUm = Math.max(
    1,
    Math.round((object.height * Math.abs(decomposition.scaleY) * 1000) / BASE_PIXELS_PER_MM),
  );
  if (options.snapResize ?? grid.snapResize) {
    widthUm = Math.max(grid.spacingUm, snapValue(widthUm, grid.spacingUm));
    heightUm = Math.max(grid.spacingUm, snapValue(heightUm, grid.spacingUm));
  }
  if (options.resizeCorner && (options.snapResize ?? grid.snapResize)) {
    center = rectangleCenterForFixedResizeAnchor(entity, widthUm, heightUm, options.resizeCorner);
  }
  const next: RectangleEntity = {
    ...entity,
    center,
    widthUm,
    heightUm,
    rotationTenthsDeg: normalizeTenthsDegrees(Math.round(decomposition.angle * 10)),
  };
  return isRectangleInWorkArea(next, workArea) ? next : null;
}

function fabricLineToEntity(
  object: FabricObject,
  entity: LineEntity,
  grid: GridSettings,
  workArea: WorkAreaSettings,
  options: ProjectionOptions,
): LineEntity | null {
  if (!(object instanceof Polyline) || object.points.length < 2) {
    return null;
  }
  const matrix = object.calcTransformMatrix();
  const toWorld = (point: { x: number; y: number }) => {
    const local = new Point(point.x - object.pathOffset.x, point.y - object.pathOffset.y);
    const world = sceneToWorld(util.transformPoint(local, matrix), workArea);
    return (options.snapMove ?? grid.snapMove)
      ? snapPoint(world, grid.spacingUm, workArea)
      : world;
  };
  const start = toWorld(object.points[0]);
  const end = toWorld(object.points[1]);
  if (!isPointInWorkArea(start, workArea) || !isPointInWorkArea(end, workArea)) {
    return null;
  }
  if (start.xUm === end.xUm && start.yUm === end.yUm) {
    return null;
  }
  return { ...entity, start, end };
}

export function fabricObjectToEntity(
  object: FabricObject,
  entity: EditableEntity,
  grid: GridSettings,
  workArea: WorkAreaSettings,
  options: ProjectionOptions = {},
): EditableEntity | null {
  return entity.kind === 'rectangle'
    ? fabricRectangleToEntity(object, entity, grid, workArea, options)
    : fabricLineToEntity(object, entity, grid, workArea, options);
}

