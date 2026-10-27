import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../i18n';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { useEditorStore } from '../state/editorStore';
import type { PolygonEntity } from '../domain/model';
import { PropertiesPanel } from './PropertiesPanel';

const store = () => useEditorStore.getState();
const polygon = () => store().document.entities[2] as PolygonEntity;
beforeEach(() => {
  store().loadDocument(parseProjectDocument(JSON.stringify(fixture)));
  store().setSelection([polygon().id]);
  render(<PropertiesPanel />);
});
afterEach(cleanup);
const enter = () => fireEvent.click(screen.getByRole('button', {name:'编辑顶点'}));
const editHole = () => act(() => store().selectPolygonVertex({partIndex:0,ringIndex:1,vertexIndex:0}));

describe('vertex property panel', () => {
  it('enters editing, commits a local coordinate on Enter, and returns to object properties', () => {
    enter(); editHole();
    const position = polygon().position, angle = polygon().rotationTenthsDeg;
    const x = screen.getByLabelText('顶点局部 X (mm)');
    x.focus(); fireEvent.change(x, {target:{value:'-8.5'}}); fireEvent.keyDown(x,{key:'Enter'});
    expect(polygon().parts[0].holes[0][0].xUm).toBe(-8500);
    expect(polygon().position).toEqual(position); expect(polygon().rotationTenthsDeg).toBe(angle);
    expect(store().undoStack).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'完成顶点编辑'}));
    expect(store().polygonEdit).toBeNull();
    expect(screen.getByLabelText('局部宽度 (mm)')).toBeDefined();
  });
  it('inserts and deletes a hole midpoint and prevents removal below three vertices', () => {
    enter(); editHole();
    fireEvent.click(screen.getByRole('button',{name:'在所选顶点之后插入中点'}));
    expect(polygon().parts[0].holes[0]).toHaveLength(5);
    expect(store().polygonEdit?.vertex.vertexIndex).toBe(1);
    fireEvent.click(screen.getByRole('button',{name:'删除所选顶点'}));
    expect(polygon().parts[0].holes[0]).toHaveLength(4);
    fireEvent.click(screen.getByRole('button',{name:'删除所选顶点'}));
    expect(polygon().parts[0].holes[0]).toHaveLength(3);
    expect((screen.getByRole('button',{name:'删除所选顶点'}) as HTMLButtonElement).disabled).toBe(true);
  });
  it('switches to the hole through the contour selector', () => {
    enter();
    fireEvent.mouseDown(screen.getByLabelText('轮廓'));
    fireEvent.click(screen.getByRole('option',{name:'孔洞 1'}));
    expect(store().polygonEdit?.vertex).toEqual({partIndex:0,ringIndex:1,vertexIndex:0});
    expect((screen.getByLabelText('顶点局部 X (mm)') as HTMLInputElement).value).toBe('-9');
  });
  it('keeps invalid coordinates out of the document and allows correction', () => {
    enter(); editHole(); const original = store().document;
    const x = screen.getByLabelText('顶点局部 X (mm)');
    x.focus(); fireEvent.change(x,{target:{value:'90'}}); fireEvent.keyDown(x,{key:'Enter'});
    expect(store().document).toBe(original);
    expect(screen.getByRole('alert').textContent).toContain('多边形不能自交');
    x.focus(); fireEvent.change(x,{target:{value:'-8'}}); fireEvent.keyDown(x,{key:'Enter'});
    expect(polygon().parts[0].holes[0][0].xUm).toBe(-8000);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
