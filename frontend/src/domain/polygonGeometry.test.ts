import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from './projectFiles';
import type { PolygonEntity } from './model';
import { isEntityInWorkArea } from './geometry';
import { isValidPolygon, polygonBounds, polygonStatistics, polygonWorldPoint, resizePolygon } from './polygonGeometry';

const document = parseProjectDocument(JSON.stringify(fixture));
const holed = document.entities[2] as PolygonEntity;
const rectangle = (min: number, max: number) => [
  { xUm: min, yUm: min }, { xUm: max, yUm: min }, { xUm: max, yUm: max }, { xUm: min, yUm: max },
];

describe('polygon geometry', () => {
  it('keeps holes and islands and calculates physical statistics', () => {
    const statistics = polygonStatistics({ ...holed, rotationTenthsDeg: 0 });
    expect(statistics).toMatchObject({ parts: 1, holes: 1, vertices: 8, areaUm2: 1472_000_000, perimeterUm: 236_000 });
    expect(document.entities.every((entity) => entity.kind === 'polygon' && isValidPolygon(entity))).toBe(true);
  });

  it('applies clockwise rotation and integer placement without changing local vertices', () => {
    const entity = { ...holed, position: { xUm: 10_000, yUm: -5_000 }, rotationTenthsDeg: 900 };
    expect(polygonWorldPoint(entity, { xUm: 2_000, yUm: 3_000 })).toEqual({ xUm: 13_000, yUm: -7_000 });
    expect(entity.parts).toBe(holed.parts);
    expect(polygonWorldPoint({ ...entity, rotationTenthsDeg: 600 }, { xUm: 1, yUm: 0 })).toEqual({ xUm: 10_001, yUm: -5_001 });
  });

  it('scales every ring and keeps position and rotation', () => {
    const resized = resizePolygon(holed, 88_000, 20_000);
    expect(polygonBounds(resized)).toMatchObject({ widthUm: 88_000, heightUm: 20_000 });
    expect(resized.parts[0].holes[0][0]).toEqual({ xUm: -18_000, yUm: -4_000 });
    expect(resized.position).toEqual(holed.position);
    expect(resized.rotationTenthsDeg).toBe(holed.rotationTenthsDeg);
  });

  it('checks the transformed vertices against the work area', () => {
    expect(isEntityInWorkArea(holed, document.workArea)).toBe(true);
    expect(isEntityInWorkArea({ ...holed, position: { xUm: 90_000, yUm: 0 } }, document.workArea)).toBe(false);
  });

  it.each([
    [[0,0],[10,10],[0,10],[10,0]],
    [[0,0],[10,0],[10,0],[0,10]],
    [[0,0],[5,0],[10,0]],
    [[0,0],[10,0],[0,10],[0,0]],
  ].map((coordinates) => ({ coordinates })))('rejects invalid ring: $coordinates', ({ coordinates }) => {
    const entity = { ...holed, rotationTenthsDeg: 0, parts: [{ outerRing: coordinates.map(([xUm,yUm]) => ({xUm,yUm})), holes: [] }] };
    expect(isValidPolygon(entity)).toBe(false);
  });

  it('rejects holes outside, touching or nested within other holes', () => {
    for (const holes of [[rectangle(9, 12)], [rectangle(0, 5)], [rectangle(2, 8), rectangle(3, 4)]]) {
      expect(isValidPolygon({ ...holed, rotationTenthsDeg: 0,
        parts: [{ outerRing: rectangle(0, 10), holes }] })).toBe(false);
    }
  });

  it('rejects overlapping parts but accepts an island inside a hole and point touching parts', () => {
    const make = (parts: PolygonEntity['parts']) => isValidPolygon({ ...holed, rotationTenthsDeg: 0, parts });
    expect(make([{ outerRing: rectangle(0,10), holes: [] }, { outerRing: rectangle(5,15), holes: [] }])).toBe(false);
    expect(make([{ outerRing: rectangle(0,10), holes: [rectangle(2,8)] }, { outerRing: rectangle(3,7), holes: [] }])).toBe(true);
    expect(make([{ outerRing: rectangle(0,10), holes: [] }, { outerRing: rectangle(10,20), holes: [] }])).toBe(true);
  });

  it('rejects a ring that collapses after world-grid quantization', () => {
    const parts = [{ outerRing: [{xUm:0,yUm:0},{xUm:1,yUm:0},{xUm:1,yUm:1},{xUm:0,yUm:1}], holes: [] }];
    expect(isValidPolygon({ ...holed, rotationTenthsDeg: 300, parts })).toBe(false);
  });
});
