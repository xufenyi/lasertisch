import { Path } from 'fabric';
import { describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/editable-text-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import type { TextEntity } from '../domain/model';
import { entityToFabricObject,fabricObjectToEntity } from './fabricAdapter';

const document=parseProjectDocument(JSON.stringify(fixture)),entity=document.entities[0] as TextEntity;
describe('text polygon canvas projection',()=>{
  it('draws only straight segments, locks scaling and preserves text source on move/rotation',()=>{
    const object=entityToFabricObject(entity,document.workArea) as Path;
    expect(object.path.every(c=>['M','L','Z'].includes(c[0]))).toBe(true);
    expect(object.lockScalingX && object.lockScalingY).toBe(true);
    expect(fabricObjectToEntity(object,entity,document.grid,document.workArea,{snapMove:false})).toEqual(entity);
    object.set({angle:12.3,left:object.left+4});
    const projected=fabricObjectToEntity(object,entity,document.grid,document.workArea,{snapMove:false}) as TextEntity;
    expect(projected.kind).toBe('text');expect(projected.text).toEqual(entity.text);expect(projected.parts).toEqual(entity.parts);
    expect(projected.rotationTenthsDeg).toBe(123);
    object.set({scaleX:1.1});expect(fabricObjectToEntity(object,entity,document.grid,document.workArea)).toBeNull();
  });
});
