import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import cases from '../../../fixtures/ellipse-sampling.json';
import fixture from '../../../fixtures/ellipses-v2.lasertisch.json';
import { parseProjectDocument, serializeProjectDocument } from './projectFiles';
import type { EllipseEntity, PointUm } from './model';
import { polygonBounds, polygonWorldParts } from './polygonGeometry';
import { constrainDrawingEnd, isEntityInWorkArea } from './geometry';
import { ellipseLocalRing, ellipseMinimumEdgeUm, ellipseToPolygon, isValidEllipse, MAX_ELLIPSE_SIDES } from './ellipseGeometry';

const document = parseProjectDocument(JSON.stringify(fixture));
const base = document.entities[0] as EllipseEntity;
const digest = (points: PointUm[]) => createHash('sha256').update(points.map((p) => `${p.xUm},${p.yUm}`).join(';')).digest('hex');

describe('parameterized ellipse geometry', () => {
  it.each(cases)('matches shared local and world samples for $sides sides at $rotationTenthsDeg', (sample) => {
    const entity = {...base, ...sample, center:{xUm:0,yUm:0}};
    expect(digest(ellipseLocalRing(entity))).toBe(sample.localSha256);
    expect(digest(polygonWorldParts(ellipseToPolygon(entity))[0].outerRing)).toBe(sample.worldSha256);
    expect(isValidEllipse(entity)).toBe(true);
  });

  it('preserves odd-micron dimensions and regenerates from parameters when the side count changes', () => {
    const entity = {...base, widthUm:20_001,heightUm:10_001,sides:4,rotationTenthsDeg:0};
    const original = ellipseLocalRing(entity);
    expect(original).toEqual([{xUm:10_001,yUm:0},{xUm:0,yUm:5001},{xUm:-10_000,yUm:0},{xUm:0,yUm:-5000}]);
    expect(ellipseLocalRing({...entity,sides:64})).toHaveLength(64);
    expect(ellipseLocalRing(entity)).toEqual(original);
    expect(ellipseToPolygon(entity)).toMatchObject({id:entity.id,name:entity.name,position:entity.center,rotationTenthsDeg:0,process:entity.process});
  });

  it('keeps generating dimensions distinct from the low-side polygon bounding box', () => {
    const entity = {...base,sides:3,rotationTenthsDeg:0};
    expect(polygonBounds(ellipseToPolygon(entity)).widthUm).toBe(45_000);
    expect(entity.widthUm).toBe(60_000);
    expect(ellipseMinimumEdgeUm(entity)).toBeGreaterThan(0);
  });

  it.each([2, 3.5, MAX_ELLIPSE_SIDES + 1, NaN])('rejects invalid side count %s', (sides) => {
    expect(isValidEllipse({...base,sides})).toBe(false);
  });
  it('rejects collapsed tiny outlines and out-of-area placement', () => {
    expect(isValidEllipse({...base,widthUm:1,heightUm:1,sides:64})).toBe(false);
    expect(isEntityInWorkArea({...base,center:{xUm:95_000,yUm:0}},document.workArea)).toBe(false);
    expect(isValidEllipse({...base,widthUm:190_001})).toBe(false);
  });
  it('uses the generated polygon rather than the rotated generating rectangle for boundary checks', () => {
    const entity = {...base,widthUm:180_000,heightUm:180_000,sides:64,rotationTenthsDeg:450,center:{xUm:0,yUm:0}};
    expect(isEntityInWorkArea(entity,document.workArea)).toBe(true);
  });
  it('round-trips only parameters and rejects ellipses in legacy projects', () => {
    const serialized = serializeProjectDocument(document);
    expect(parseProjectDocument(serialized)).toEqual(document);
    expect(serialized).not.toContain('outerRing');
    expect(() => parseProjectDocument(JSON.stringify({...fixture,schemaVersion:1}))).toThrow(/version 2/);
    const invalid = structuredClone(fixture); invalid.entities[0].sides = 2;
    expect(() => parseProjectDocument(JSON.stringify(invalid))).toThrow(/ellipse/);
  });
  it.each([{xUm:20_000,yUm:10_000},{xUm:-20_000,yUm:10_000},{xUm:20_000,yUm:-10_000},{xUm:-20_000,yUm:-10_000}])('constrains Shift drawing to a square in every quadrant: %j', (end) => {
    const result = constrainDrawingEnd('ellipse',{xUm:0,yUm:0},end,true);
    expect(Math.abs(result.xUm)).toBe(Math.abs(result.yUm));
    expect(constrainDrawingEnd('ellipse',{xUm:0,yUm:0},end,false)).toEqual(end);
  });
});
