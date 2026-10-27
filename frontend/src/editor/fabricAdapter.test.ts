import { ActiveSelection, Path, Point, Rect, util } from 'fabric';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, DEFAULT_PROCESS, type RectangleEntity } from '../domain/model';
import { snapRectangleCenter, worldToScene } from '../domain/geometry';
import {
  entityToFabricObject,
  fabricObjectToEntity,
  snapObjectCenterForMove,
} from './fabricAdapter';
import polygonProject from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import type { PolygonEntity } from '../domain/model';
import { polygonBounds, polygonWorldPoint } from '../domain/polygonGeometry';
import { sceneToWorld } from '../domain/geometry';

describe('rectangle move projection', () => {
  it('keeps a half-grid centre through preview and mouse-release projection', () => {
    const document = createEmptyDocument();
    const { workArea } = document;
    const grid = { ...document.grid, spacingUm: 1_000 };
    const entity: RectangleEntity = {
      id: 'odd-rectangle', kind: 'rectangle', name: 'Odd rectangle',
      visible: true, locked: false, process: DEFAULT_PROCESS,
      center: { xUm: 1_500, yUm: 2_500 }, widthUm: 3_000, heightUm: 5_000,
      rotationTenthsDeg: 0,
    };
    const object = entityToFabricObject(entity, workArea);
    const center = snapRectangleCenter({ xUm: 4_620, yUm: -3_610 }, grid.spacingUm, workArea);
    const scene = worldToScene(center, workArea);
    object.set({ left: scene.x, top: scene.y });
    const options = { snapMove: false, snapResize: false };
    expect(fabricObjectToEntity(object, entity, grid, workArea, options))
      .toEqual({ ...entity, center });
    expect(fabricObjectToEntity(object, entity, grid, workArea))
      .toEqual({ ...entity, center });
  });
});

describe('polygon projection', () => {
  const document = parseProjectDocument(JSON.stringify(polygonProject));
  const holed = document.entities[2] as PolygonEntity;
  const options = { snapMove: false, snapResize: false };

  it('renders only straight closed subpaths with even-odd holes', () => {
    const object = entityToFabricObject(holed, document.workArea) as Path;
    expect(object).toBeInstanceOf(Path);
    expect(object.fillRule).toBe('evenodd');
    expect(object.path.filter((command) => command[0] === 'Z')).toHaveLength(2);
    expect(object.path.every((command) => ['M', 'L', 'Z'].includes(command[0]))).toBe(true);
    expect(object.perPixelTargetFind).toBe(true);
  });

  it.each([0, 1, 150, 900, 1733, 3599])('preserves the local origin and vertices at %i tenths of a degree', (angle) => {
    // An off-centre local bounding box must not shift during projection.
    const entity = { ...holed, rotationTenthsDeg: angle, parts: holed.parts.map((part) => ({
      outerRing: part.outerRing.map((p) => ({ xUm:p.xUm + 1234, yUm:p.yUm - 567 })),
      holes: part.holes.map((ring) => ring.map((p) => ({ xUm:p.xUm + 1234, yUm:p.yUm - 567 }))),
    })) };
    const object = entityToFabricObject(entity, document.workArea);
    expect(fabricObjectToEntity(object, entity, document.grid, document.workArea, options)).toEqual(entity);
  });

  it('keeps vertices local on movement and rejects movement out of bounds', () => {
    const object = entityToFabricObject(holed, document.workArea);
    object.set({ left: object.left + 40, top: object.top - 20 });
    expect(fabricObjectToEntity(object, holed, document.grid, document.workArea, options))
      .toEqual({ ...holed, position: { xUm: holed.position.xUm + 10_000, yUm: holed.position.yUm + 5_000 } });
    object.set({ left: object.left + 1000 });
    expect(fabricObjectToEntity(object, holed, document.grid, document.workArea, options)).toBeNull();
  });

  it('projects scaling to local vertices and matches the transformed canvas points', () => {
    const object = entityToFabricObject(holed, document.workArea) as Path;
    object.set({ scaleX: 0.5, scaleY: 0.75, angle: 31.2 });
    const projected = fabricObjectToEntity(object, holed, document.grid, document.workArea, options) as PolygonEntity;
    expect(polygonBounds(projected)).toMatchObject({ widthUm: 22_000, heightUm: 30_000 });
    expect(projected.rotationTenthsDeg).toBe(312);
    const p = holed.parts[0].holes[0][0];
    const screen = util.transformPoint(new Point(p.xUm * .004 - object.pathOffset.x, -p.yUm * .004 - object.pathOffset.y), object.calcTransformMatrix());
    expect(polygonWorldPoint(projected, projected.parts[0].holes[0][0])).toEqual(sceneToWorld(screen, document.workArea));
  });

  it('supports moving a polygon together with other selected objects', () => {
    const first = entityToFabricObject(holed, document.workArea);
    const second = entityToFabricObject(document.entities[0], document.workArea);
    const selection = new ActiveSelection([first, second]);
    selection.set({ left: selection.left + 20, top: selection.top + 12 });
    expect(fabricObjectToEntity(first, holed, document.grid, document.workArea, options))
      .toEqual({ ...holed, position: { xUm: holed.position.xUm + 5_000, yUm: holed.position.yUm - 3_000 } });
  });

  it('snaps a resized corner while keeping the opposite anchor fixed', () => {
    const entity = { ...holed, position: { xUm:0, yUm:0 }, rotationTenthsDeg: 0 };
    const object = entityToFabricObject(entity, document.workArea);
    object.set({ scaleX: 1.1, scaleY: 1.1 });
    const result = fabricObjectToEntity(object, entity, { ...document.grid, snapResize: true }, document.workArea,
      { snapMove: false, snapResize: true, resizeCorner: 'br' }) as PolygonEntity;
    const bounds = polygonBounds(result);
    expect(bounds.widthUm).toBe(50_000);
    expect(bounds.heightUm).toBe(45_000);
    expect(polygonWorldPoint(result, { xUm:bounds.minX, yUm:bounds.maxY })).toEqual({ xUm:-22_000, yUm:20_000 });
  });
});

describe('multi-selection move snapping', () => {
  it('snaps an active selection bounding-box centre to a half-grid position', () => {
    const { workArea } = createEmptyDocument();
    const selection = new ActiveSelection([
      new Rect({ left: 0, top: 0, width: 10, height: 10 }),
      new Rect({ left: 20, top: 0, width: 10, height: 10 }),
    ]);
    expect(snapObjectCenterForMove(
      selection,
      { xUm: 2_620, yUm: -3_610 },
      1_000,
      workArea,
    )).toEqual({ xUm: 2_500, yUm: -3_500 });
  });

  it('keeps line movement on whole-grid snapping', () => {
    const { workArea } = createEmptyDocument();
    const generic = entityToFabricObject({
      id: 'line', kind: 'line', name: 'Line', visible: true, locked: false,
      process: DEFAULT_PROCESS, start: { xUm: 0, yUm: 0 }, end: { xUm: 1_000, yUm: 0 },
    }, workArea);
    expect(snapObjectCenterForMove(generic, { xUm: 2_620, yUm: -3_610 }, 1_000, workArea))
      .toEqual({ xUm: 3_000, yUm: -4_000 });
  });
});
