import { ActiveSelection, Path } from 'fabric';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/ellipses-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import type { EllipseEntity } from '../domain/model';
import { BASE_PIXELS_PER_MM } from '../domain/model';
import { worldToScene } from '../domain/geometry';
import { ellipseToPolygon } from '../domain/ellipseGeometry';
import { polygonBounds } from '../domain/polygonGeometry';
import { entityToFabricObject, fabricObjectToEntity } from './fabricAdapter';

const document = parseProjectDocument(JSON.stringify(fixture));
const base = document.entities[0] as EllipseEntity;
const options = {snapMove:false,snapResize:false};

describe('ellipse canvas projection', () => {
  it.each([3,5,6,64,127])('preserves parameter dimensions for %i sides instead of inferring from polygon bounds', (sides) => {
    const entity = {...base,sides};
    const object = entityToFabricObject(entity,document.workArea) as Path;
    expect(object).toBeInstanceOf(Path);
    expect(object.width).toBe(entity.widthUm * BASE_PIXELS_PER_MM / 1000);
    expect(object.height).toBe(entity.heightUm * BASE_PIXELS_PER_MM / 1000);
    expect(object.pathOffset.x).toBe(0); expect(object.pathOffset.y).toBe(0);
    expect(object.path.every((command) => ['M','L','Z'].includes(command[0]))).toBe(true);
    expect(fabricObjectToEntity(object,entity,document.grid,document.workArea,options)).toEqual(entity);
    if (sides === 3) expect(polygonBounds(ellipseToPolygon(entity)).widthUm).toBeLessThan(entity.widthUm);
  });
  it('scales, moves and rotates the parameters while keeping the side count', () => {
    const object = entityToFabricObject(base,document.workArea);
    object.set({scaleX:.5,scaleY:.75,angle:31.2,left:object.left+12,top:object.top-8});
    const projected = fabricObjectToEntity(object,base,document.grid,document.workArea,options) as EllipseEntity;
    expect(projected).toMatchObject({kind:'ellipse',widthUm:30_000,heightUm:26_250,rotationTenthsDeg:312,sides:32,
      center:{xUm:base.center.xUm+3000,yUm:base.center.yUm+2000}});
  });
  it('supports mixed selection and rejects out-of-area movement', () => {
    const first = entityToFabricObject(base,document.workArea);
    const second = entityToFabricObject(document.entities[1],document.workArea);
    const group = new ActiveSelection([first,second]);
    group.set({left:group.left+20,top:group.top+12});
    expect(fabricObjectToEntity(first,base,document.grid,document.workArea,options))
      .toEqual({...base,center:{xUm:base.center.xUm+5000,yUm:base.center.yUm-3000}});
    group.set({left:group.left+1000});
    expect(fabricObjectToEntity(first,base,document.grid,document.workArea,options)).toBeNull();
  });
  it('snaps resize dimensions and keeps the opposite corner fixed', () => {
    const entity = {...base,rotationTenthsDeg:0,center:{xUm:0,yUm:0}};
    const object = entityToFabricObject(entity,document.workArea);
    object.set({scaleX:1.1,scaleY:1.1});
    const projected = fabricObjectToEntity(object,entity,document.grid,document.workArea,{snapMove:false,snapResize:true,resizeCorner:'br'}) as EllipseEntity;
    expect(projected).toMatchObject({widthUm:65_000,heightUm:40_000,center:{xUm:2500,yUm:-2500},sides:32});
    const center = worldToScene(projected.center,document.workArea);
    expect(center.x).toBeGreaterThan(0);
  });
});
