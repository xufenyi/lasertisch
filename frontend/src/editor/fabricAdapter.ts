import {
  ActiveSelection,
  controlsUtils,
  FabricObject,
  Line,
  Path,
  Point,
  Polyline,
  Rect,
  util,
} from 'fabric';

import {
  BASE_PIXELS_PER_MM,
  type EditableEntity,
  type EllipseEntity,
  type GridSettings,
  type LineEntity,
  type PointUm,
  type PolygonEntity,
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
  isEntityInWorkArea,
} from '../domain/geometry';
import { isValidPolygon, polygonBounds, polygonRings, resizePolygon } from '../domain/polygonGeometry';
import { normalizeTenthsDegrees } from '../domain/units';
import { ellipseToPolygon, isValidEllipse } from '../domain/ellipseGeometry';

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
  return object instanceof Rect || object instanceof Path || object instanceof ActiveSelection
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
    : entity.kind === 'polygon'
      ? polygonObject(entity, workArea, zoom)
      : entity.kind === 'ellipse'
        ? ellipseObject(entity, workArea, zoom)
        : lineObject(entity, workArea, zoom);
  object.visible = entity.visible;
  object.selectable = !entity.locked;
  object.evented = !entity.locked;
  object.hoverCursor = 'move';
  object.moveCursor = 'move';
  return object;
}

function polygonObject(entity: PolygonEntity, workArea: WorkAreaSettings, zoom: number): Path {
  const factor = BASE_PIXELS_PER_MM / 1000;
  const commands = polygonRings(entity.parts).map((ring) => ring.map((point, i) =>
    `${i === 0 ? 'M' : 'L'} ${point.xUm * factor} ${-point.yUm * factor}`).join(' ') + ' Z').join(' ');
  const object = new Path(commands, {
    originX: 'center', originY: 'center', angle: entity.rotationTenthsDeg / 10,
    fill: 'rgba(39, 120, 194, 0.13)', fillRule: 'evenodd',
    stroke: '#1666a7', strokeWidth: RECTANGLE_STROKE_PX / zoom, strokeUniform: true,
    objectCaching: false, perPixelTargetFind: true, padding: 3,
    cornerColor: '#ffffff', cornerStrokeColor: '#1666a7', transparentCorners: false,
    lockScalingFlip: true, lockSkewingX: true, lockSkewingY: true,
    activeOn: 'down', snapAngle: 0.1, snapThreshold: 0.05,
  });
  const origin = worldToScene(entity.position, workArea);
  const angle = entity.rotationTenthsDeg * Math.PI / 1800;
  const offset = object.pathOffset;
  object.set({
    left: origin.x + offset.x * Math.cos(angle) - offset.y * Math.sin(angle),
    top: origin.y + offset.x * Math.sin(angle) + offset.y * Math.cos(angle),
  });
  setEntityId(object, entity.id);
  (object as AnnotatedFabricObject).screenStrokeWidthPx = RECTANGLE_STROKE_PX;
  object.setCoords();
  return object;
}

function ellipseObject(entity: EllipseEntity, workArea: WorkAreaSettings, zoom: number): Path {
  const object = polygonObject(ellipseToPolygon(entity), workArea, zoom);
  const center = worldToScene(entity.center, workArea);
  // The controls describe the generating rectangle even when a low side count
  // does not place vertices at all four extrema of that rectangle.
  object.set({ left: center.x, top: center.y, pathOffset: new Point(0, 0),
    width: entity.widthUm * BASE_PIXELS_PER_MM / 1000,
    height: entity.heightUm * BASE_PIXELS_PER_MM / 1000 });
  object.setCoords();
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

function fabricBoxToEntity<T extends RectangleEntity | EllipseEntity>(
  object: FabricObject,
  entity: T,
  grid: GridSettings,
  workArea: WorkAreaSettings,
  options: ProjectionOptions,
): T | null {
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
  const next: T = {
    ...entity,
    center,
    widthUm,
    heightUm,
    rotationTenthsDeg: normalizeTenthsDegrees(Math.round(decomposition.angle * 10)),
  };
  return (next.kind !== 'ellipse' || isValidEllipse(next)) && isEntityInWorkArea(next, workArea) ? next : null;
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
  return entity.kind === 'rectangle' || entity.kind === 'ellipse'
    ? fabricBoxToEntity(object, entity, grid, workArea, options)
    : entity.kind === 'polygon'
      ? fabricPolygonToEntity(object, entity, grid, workArea, options)
      : fabricLineToEntity(object, entity, grid, workArea, options);
}

function fabricPolygonToEntity(
  object: FabricObject, entity: PolygonEntity, grid: GridSettings,
  workArea: WorkAreaSettings, options: ProjectionOptions,
): PolygonEntity | null {
  if (!(object instanceof Path)) return null;
  const decomposition = util.qrDecompose(object.calcTransformMatrix());
  if (decomposition.scaleX <= 0 || decomposition.scaleY <= 0 || Math.abs(decomposition.skewX) > 1e-6) return null;
  const bounds = polygonBounds(entity);
  let widthUm = Math.max(1, Math.round(bounds.widthUm * decomposition.scaleX));
  let heightUm = Math.max(1, Math.round(bounds.heightUm * decomposition.scaleY));
  if (options.snapResize ?? grid.snapResize) {
    widthUm = Math.max(grid.spacingUm, snapValue(widthUm, grid.spacingUm));
    heightUm = Math.max(grid.spacingUm, snapValue(heightUm, grid.spacingUm));
  }
  const resized = widthUm === bounds.widthUm && heightUm === bounds.heightUm
    ? entity : resizePolygon(entity, widthUm, heightUm);
  const nextBounds = polygonBounds(resized);
  const rotationTenthsDeg = normalizeTenthsDegrees(Math.round(decomposition.angle * 10));
  let centerScene = transformedCenter(object);
  if (options.resizeCorner && (options.snapResize ?? grid.snapResize)) {
    const sourceCenter = worldToScene(entity.position, workArea);
    const angle = entity.rotationTenthsDeg * Math.PI / 1800;
    const x = (bounds.minX + bounds.maxX) / 2 * BASE_PIXELS_PER_MM / 1000;
    const y = -(bounds.minY + bounds.maxY) / 2 * BASE_PIXELS_PER_MM / 1000;
    const center = sceneToWorld({
      x: sourceCenter.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: sourceCenter.y + x * Math.sin(angle) + y * Math.cos(angle),
    }, workArea);
    centerScene = new Point(worldToScene(rectangleCenterForFixedResizeAnchor({
      ...entity, kind: 'rectangle', center, widthUm: bounds.widthUm, heightUm: bounds.heightUm,
    }, nextBounds.widthUm, nextBounds.heightUm, options.resizeCorner), workArea));
  } else if (options.snapMove ?? grid.snapMove) {
    centerScene = new Point(worldToScene(snapRectangleCenter(
      sceneToWorld(centerScene, workArea), grid.spacingUm, workArea,
    ), workArea));
  }
  const angle = rotationTenthsDeg * Math.PI / 1800;
  const offsetX = (nextBounds.minX + nextBounds.maxX) / 2 * BASE_PIXELS_PER_MM / 1000;
  const offsetY = -(nextBounds.minY + nextBounds.maxY) / 2 * BASE_PIXELS_PER_MM / 1000;
  const position = sceneToWorld({
    x: centerScene.x - offsetX * Math.cos(angle) + offsetY * Math.sin(angle),
    y: centerScene.y - offsetX * Math.sin(angle) - offsetY * Math.cos(angle),
  }, workArea);
  const result = { ...resized, position, rotationTenthsDeg };
  return isValidPolygon(result) && isEntityInWorkArea(result, workArea) ? result : null;
}

