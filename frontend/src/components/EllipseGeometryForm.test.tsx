import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../i18n';
import fixture from '../../../fixtures/ellipses-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { useEditorStore } from '../state/editorStore';
import type { EllipseEntity } from '../domain/model';
import { PropertiesPanel } from './PropertiesPanel';

const store = () => useEditorStore.getState();
const entity = () => store().document.entities[0] as EllipseEntity;
function commit(label: string, value: string) {
  const field = screen.getByLabelText(label); field.focus();
  fireEvent.change(field,{target:{value}}); fireEvent.keyDown(field,{key:'Enter'});
}
beforeEach(() => {
  store().loadDocument(parseProjectDocument(JSON.stringify(fixture)));
  store().setSelection([entity().id]); render(<PropertiesPanel />);
});
afterEach(cleanup);

describe('ellipse property panel', () => {
  it('changes side count and dimensions independently using Enter', () => {
    const original = entity();
    commit('边数','5');
    expect(entity()).toEqual({...original,sides:5}); expect(store().undoStack).toHaveLength(1);
    commit('宽度 (mm)','40.001');
    expect(entity().widthUm).toBe(40_001); expect(entity().heightUm).toBe(original.heightUm);
    commit('角度 (°)','90'); expect(entity().rotationTenthsDeg).toBe(900);
    expect(screen.getByText(/增加边数可提高形状的近似精度/)).toBeDefined();
    expect(screen.getByText(/低边数时实际多边形包围盒可能较小/)).toBeDefined();
  });
  it('keeps invalid side counts out of the document and allows correction', () => {
    const original = store().document;
    for (const value of ['2','1025','3.5']) {
      commit('边数',value); expect(store().document).toBe(original);
    }
    expect(store().undoStack).toHaveLength(0);
    expect(screen.getByText(/请输入有效参数/)).toBeDefined();
    commit('边数','64'); expect(entity().sides).toBe(64);
    expect(screen.queryByText(/请输入有效参数/)).toBeNull();
  });
  it('shows a short-contour warning for small ellipses without discarding their edges', () => {
    act(() => store().replaceEntities([{...entity(),widthUm:1000,heightUm:1000,sides:64}]));
    expect(screen.getByText(/存在短于 0.1 mm 的轮廓边/)).toBeDefined();
    expect(entity().sides).toBe(64);
  });
  it('converts to ordinary polygon properties and undo restores the side-count field', () => {
    const original = entity();
    fireEvent.click(screen.getByRole('button',{name:'转换为普通多边形'}));
    expect(store().document.entities[0].kind).toBe('polygon');
    expect(screen.queryByLabelText('边数')).toBeNull();
    expect(screen.getByRole('button',{name:'编辑顶点'})).toBeDefined();
    act(() => store().undo()); expect(entity()).toEqual(original);
    expect(screen.getByLabelText('边数')).toBeDefined();
  });
  it('rejects out-of-area positions and leaves valid parameters unchanged', () => {
    const original = store().document;
    commit('中心 X (mm)','95');
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
  });
});
