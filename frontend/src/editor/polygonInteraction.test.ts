import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { polygonWorldPoint } from '../domain/polygonGeometry';
import type { PolygonEntity } from '../domain/model';
import { worldToScene } from '../domain/geometry';
import { findPolygonEdge, findPolygonVertex, isNearPolygonStart } from './polygonInteraction';

const document = parseProjectDocument(JSON.stringify(fixture));
const entity = document.entities[2] as PolygonEntity;
describe('polygon screen hit testing', () => {
  it.each([.5, 1, 20])('uses a constant screen tolerance at zoom %s for rotated hole vertices', (zoom) => {
    const point = worldToScene(polygonWorldPoint(entity, entity.parts[0].holes[0][0]), document.workArea);
    expect(findPolygonVertex(entity, {...point,x:point.x + 5 / zoom}, zoom, document.workArea))
      .toEqual({partIndex:0,ringIndex:1,vertexIndex:0});
    expect(findPolygonVertex(entity, {...point,x:point.x + 9 / zoom}, zoom, document.workArea)).not.toEqual({partIndex:0,ringIndex:1,vertexIndex:0});
  });
  it('locates the closing edge and inserts in local coordinates', () => {
    const point = worldToScene(polygonWorldPoint(entity, {xUm:-9000,yUm:0}), document.workArea);
    const edge = findPolygonEdge(entity, point, 1, document.workArea)!;
    expect(edge.address).toEqual({partIndex:0,ringIndex:1,vertexIndex:3});
    expect(Math.abs(edge.localPoint.xUm + 9000)).toBeLessThanOrEqual(1);
    expect(Math.abs(edge.localPoint.yUm)).toBeLessThanOrEqual(1);
  });
  it('closes near the first point with a zoom-independent screen threshold', () => {
    const draft = [{xUm:0,yUm:0}];
    const first = worldToScene(draft[0], document.workArea);
    expect(isNearPolygonStart(draft, {...first,x:first.x + 3}, 2, document.workArea)).toBe(true);
    expect(isNearPolygonStart(draft, {...first,x:first.x + 5}, 2, document.workArea)).toBe(false);
    expect(isNearPolygonStart([], first, 1, document.workArea)).toBe(false);
  });
});
