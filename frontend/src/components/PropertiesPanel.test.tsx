import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import '../i18n';
import { DEFAULT_PROCESS, type LineEntity } from '../domain/model';
import { useEditorStore } from '../state/editorStore';
import { PropertiesPanel } from './PropertiesPanel';

const line = (id: string, name: string, yUm: number): LineEntity => ({
  id,
  kind: 'line',
  name,
  process: DEFAULT_PROCESS,
  start: { xUm: 0, yUm },
  end: { xUm: 1_000, yUm },
});

beforeEach(() => {
  useEditorStore.getState().newProject('Objects');
  act(() => {
    useEditorStore.getState().addEntity(line('00000000-0000-4000-8000-000000000101', 'First', 0));
    useEditorStore.getState().addEntity(line('00000000-0000-4000-8000-000000000102', 'Second', 2_000));
    useEditorStore.getState().markSaved();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('object list controls', () => {
  it('toggles workspace-only visibility and locking without document history', () => {
    render(<PropertiesPanel />);
    const document = useEditorStore.getState().document;
    const historyLength = useEditorStore.getState().undoStack.length;

    fireEvent.click(screen.getAllByRole('button', { name: '隐藏对象' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '锁定对象' })[0]);

    const state = useEditorStore.getState();
    expect(state.document).toBe(document);
    expect(state.entityWorkspaceStates[document.processingOrder[0]])
      .toEqual({ visible: false, locked: true });
    expect(state.undoStack).toHaveLength(historyLength);
    expect(state.isDirty).toBe(false);
    expect(screen.getByRole('button', { name: '显示对象' })).toBeDefined();
    expect(screen.getByRole('button', { name: '解锁对象' })).toBeDefined();
  });

  it('drops an object at an arbitrary position as one undoable reorder', () => {
    render(<PropertiesPanel />);
    const handles = screen.getAllByRole('button', { name: '拖动调整加工顺序' });
    const targetRow = handles[1].closest('li')!;
    vi.spyOn(targetRow, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 300, bottom: 40, width: 300, height: 40,
      toJSON: () => ({}),
    });
    const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() };
    const historyLength = useEditorStore.getState().undoStack.length;

    fireEvent.dragStart(handles[0], { dataTransfer });
    fireEvent.dragOver(targetRow, { dataTransfer, clientY: 39 });
    fireEvent.drop(targetRow, { dataTransfer, clientY: 39 });

    expect(useEditorStore.getState().document.processingOrder).toEqual([
      '00000000-0000-4000-8000-000000000102',
      '00000000-0000-4000-8000-000000000101',
    ]);
    expect(useEditorStore.getState().undoStack).toHaveLength(historyLength + 1);
    act(() => useEditorStore.getState().undo());
    expect(useEditorStore.getState().document.processingOrder).toEqual([
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
    ]);
  });
});
