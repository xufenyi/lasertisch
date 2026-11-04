import { describe, expect, it } from 'vitest';

import editableText from '../../../fixtures/editable-text-v2.lasertisch.json';
import ellipseFixture from '../../../fixtures/ellipses-v2.lasertisch.json';
import polygonFixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from './projectFiles';
import {
  cloneClipboardForPlacement,
  entitiesCanFitWorkArea,
  isEntityValidForPlacement,
  placementAnchor,
  translateEntity,
} from './entityPlacement';
import type { EditableEntity, LineEntity, RectangleEntity } from './model';

const polygonDocument = parseProjectDocument(JSON.stringify(polygonFixture));
const workArea = polygonDocument.workArea;
const rectangle: RectangleEntity = {
  id: '00000000-0000-0000-0000-000000000101', kind: 'rectangle', name: 'Rectangle',
  visible: true, locked: false, process: polygonDocument.defaultProcess,
  center: { xUm: 1_000, yUm: 2_000 }, widthUm: 10_000, heightUm: 8_000,
  rotationTenthsDeg: 300,
};
const line: LineEntity = {
  id: '00000000-0000-0000-0000-000000000102', kind: 'line', name: 'Line',
  visible: true, locked: false, process: { ...polygonDocument.defaultProcess, mode: 'contour' },
  start: { xUm: -5_000, yUm: 0 }, end: { xUm: 5_000, yUm: 0 },
};

describe('entity placement geometry', () => {
  it('translates every entity kind without changing shape-specific data', () => {
    const ellipse = parseProjectDocument(JSON.stringify(ellipseFixture)).entities[0];
    const polygon = polygonDocument.entities[0];
    const text = parseProjectDocument(JSON.stringify(editableText)).entities[0];
    const entities: EditableEntity[] = [line, rectangle, ellipse, polygon, text];
    for (const source of entities) {
      expect(isEntityValidForPlacement(source, workArea)).toBe(true);
      const moved = translateEntity(source, 1_234, -5_678);
      if (source.kind === 'line' && moved.kind === 'line') {
        expect(moved.start).toEqual({ xUm: source.start.xUm + 1_234, yUm: source.start.yUm - 5_678 });
        expect(moved.end).toEqual({ xUm: source.end.xUm + 1_234, yUm: source.end.yUm - 5_678 });
      } else if ((source.kind === 'rectangle' || source.kind === 'ellipse') &&
        (moved.kind === 'rectangle' || moved.kind === 'ellipse')) {
        expect(moved.center).toEqual({ xUm: source.center.xUm + 1_234, yUm: source.center.yUm - 5_678 });
      } else if ((source.kind === 'polygon' || source.kind === 'text') &&
        (moved.kind === 'polygon' || moved.kind === 'text')) {
        expect(moved.position).toEqual({ xUm: source.position.xUm + 1_234, yUm: source.position.yUm - 5_678 });
        expect(moved.parts).toEqual(source.parts);
      } else throw new Error('entity kind changed');
      expect(moved.id).toBe(source.id);
    }
  });

  it('computes a group anchor and rejects candidates outside the work area', () => {
    expect(placementAnchor([line])).toEqual({ xUm: 0, yUm: 0 });
    expect(entitiesCanFitWorkArea([line, rectangle], workArea)).toBe(true);
    expect(isEntityValidForPlacement(line, workArea)).toBe(true);
    expect(isEntityValidForPlacement(translateEntity(line, 100_000, 0), workArea)).toBe(false);
  });

  it('creates independent IDs while preserving entity and processing order', () => {
    const clipboard = { entities: [rectangle, line], processingOrder: [line.id, rectangle.id] };
    const clones = cloneClipboardForPlacement(clipboard)!;
    expect(clones.entities.map((entity) => entity.kind)).toEqual(['rectangle', 'line']);
    expect(clones.entities.map((entity) => entity.id)).not.toContain(rectangle.id);
    expect(clones.entities.map((entity) => entity.id)).not.toContain(line.id);
    expect(clones.processingOrder).toEqual([clones.entities[1].id, clones.entities[0].id]);
    clones.entities[0].name = 'Changed';
    expect(rectangle.name).toBe('Rectangle');
  });
});
