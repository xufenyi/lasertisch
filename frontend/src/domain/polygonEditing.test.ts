import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from './projectFiles';
import { DEFAULT_PROCESS, type PolygonEntity } from './model';
import { polygonWorldParts, polygonWorldPoint } from './polygonGeometry';
import { deletePolygonVertex, insertPolygonVertex, movePolygonVertex, polygonFromPoints, polygonRing, polygonWorldToLocal } from './polygonEditing';

const document = parseProjectDocument(JSON.stringify(fixture));
const holed = document.entities[2] as PolygonEntity;
const hole = { partIndex: 0, ringIndex: 1, vertexIndex: 0 };

describe('polygon editing geometry', () => {
  it('builds local rings from world clicks without changing the drawn shape', () => {
    const points = [{ xUm:10_001,yUm:-3000 },{ xUm:20_000,yUm:-3000 },{ xUm:15_000,yUm:6001 }];
    const polygon = polygonFromPoints(points, DEFAULT_PROCESS, 'Polygon 1', document.workArea)!;
    expect(polygonWorldParts(polygon)[0].outerRing).toEqual(points);
    expect(polygon.process).toEqual(DEFAULT_PROCESS);
    expect(polygon.rotationTenthsDeg).toBe(0);
  });
  it.each([
    [{xUm:0,yUm:0},{xUm:1000,yUm:0}],
    [{xUm:0,yUm:0},{xUm:1000,yUm:1000},{xUm:0,yUm:1000},{xUm:1000,yUm:0}],
    [{xUm:0,yUm:0},{xUm:1000,yUm:0},{xUm:2000,yUm:0}],
    [{xUm:0,yUm:0},{xUm:100_000,yUm:0},{xUm:0,yUm:1000}],
  ].map((points) => ({points})))('rejects invalid drawn points: $points', ({points}) => {
    expect(polygonFromPoints(points, DEFAULT_PROCESS, 'Invalid', document.workArea)).toBeNull();
  });
  it('edits a hole without changing exterior vertices or placement', () => {
    const moved = movePolygonVertex(holed, hole, {xUm:-8000,yUm:-7000})!;
    expect(moved.parts[0].outerRing).toBe(holed.parts[0].outerRing);
    expect(moved.parts[0].holes[0][0]).toEqual({xUm:-8000,yUm:-7000});
    expect(moved.position).toBe(holed.position);
    expect(holed.parts[0].holes[0][0]).toEqual({xUm:-9000,yUm:-8000});
  });
  it('inserts on the closing edge and can delete the added vertex', () => {
    const address = { ...hole, vertexIndex: 3 };
    const inserted = insertPolygonVertex(holed, address)!;
    expect(polygonRing(inserted, hole)).toHaveLength(5);
    expect(polygonRing(inserted, hole)![4]).toEqual({xUm:-9000,yUm:0});
    expect(deletePolygonVertex(inserted, {...hole,vertexIndex:4})).toEqual(holed);
    const triangle = polygonFromPoints([{xUm:0,yUm:0},{xUm:1000,yUm:0},{xUm:0,yUm:1000}], DEFAULT_PROCESS, 'Triangle', document.workArea)!;
    expect(deletePolygonVertex(triangle, {...hole,ringIndex:0})).toBeNull();
  });
  it('rejects invalid addresses and edits another disconnected part independently', () => {
    expect(movePolygonVertex(holed, {...hole,partIndex:8}, {xUm:0,yUm:0})).toBeNull();
    expect(polygonRing(holed, {...hole,vertexIndex:-1})).toBeNull();
    const polygon = document.entities[3] as PolygonEntity;
    const moved = movePolygonVertex(polygon, {partIndex:1,ringIndex:0,vertexIndex:0}, {xUm:6000,yUm:-9000})!;
    expect(moved.parts[0]).toBe(polygon.parts[0]);
    expect(moved.parts[1].outerRing[0]).toEqual({xUm:6000,yUm:-9000});
  });
  it('inverts placement and clockwise rotation for mouse editing', () => {
    const entity = {...holed, rotationTenthsDeg:900};
    const point = {xUm:-8000,yUm:5000};
    expect(polygonWorldToLocal(entity, polygonWorldPoint(entity, point))).toEqual(point);
  });
});
