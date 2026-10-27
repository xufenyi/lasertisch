import { ActiveSelection, Rect } from 'fabric';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, DEFAULT_PROCESS, type RectangleEntity } from '../domain/model';
import { snapRectangleCenter, worldToScene } from '../domain/geometry';
import {
  entityToFabricObject,
  fabricObjectToEntity,
  snapObjectCenterForMove,
} from './fabricAdapter';

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
