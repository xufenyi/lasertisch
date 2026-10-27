import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyDocument, DEFAULT_PROCESS, type LineEntity } from '../domain/model';
import { isValidEntityName, useEditorStore } from './editorStore';

const line: LineEntity = {
  id: 'line-1',
  kind: 'line',
  name: 'Line 1',
  visible: true,
  locked: false,
  process: DEFAULT_PROCESS,
  start: { xUm: 0, yUm: 0 },
  end: { xUm: 1_000, yUm: 0 },
};

beforeEach(() => {
  useEditorStore.setState({
    document: createEmptyDocument(),
    selectionIds: [],
    transientEntities: {},
    tool: 'select',
    status: null,
  });
});

describe('canonical editor store', () => {
  it('starts with a 5 mm grid interval', () => {
    expect(useEditorStore.getState().document.grid.spacingUm).toBe(5_000);
  });

  it('adds an entity to geometry and processing order together', () => {
    useEditorStore.getState().addEntity(line);

    const state = useEditorStore.getState();
    expect(state.document.entities).toEqual([line]);
    expect(state.document.processingOrder).toEqual([line.id]);
    expect(state.selectionIds).toEqual([line.id]);
  });

  it('replaces canonical geometry without changing order', () => {
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().replaceEntities([
      { ...line, end: { xUm: 2_000, yUm: 0 } },
    ]);

    expect(useEditorStore.getState().document.entities[0]).toMatchObject({
      end: { xUm: 2_000, yUm: 0 },
    });
    expect(useEditorStore.getState().document.processingOrder).toEqual([line.id]);
  });

  it('deletes selected objects from both collections', () => {
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().deleteSelected();

    expect(useEditorStore.getState().document.entities).toEqual([]);
    expect(useEditorStore.getState().document.processingOrder).toEqual([]);
  });

  it('updates a translated work area and rejects one that excludes geometry', () => {
    useEditorStore.getState().addEntity(line);
    expect(useEditorStore.getState().updateWorkArea({
      widthUm: 100_000,
      heightUm: 100_000,
      center: { xUm: 10_000, yUm: 20_000 },
    })).toBe(true);
    expect(useEditorStore.getState().document.workArea.center).toEqual({ xUm: 10_000, yUm: 20_000 });
    expect(useEditorStore.getState().updateWorkArea({
      widthUm: 1_000,
      heightUm: 1_000,
      center: { xUm: 100_000, yUm: 100_000 },
    })).toBe(false);
  });

  it('renames an entity and rejects empty or reserved-character names', () => {
    useEditorStore.getState().addEntity(line);
    expect(useEditorStore.getState().renameEntity(line.id, '  Cut line  ')).toBe(true);
    expect(useEditorStore.getState().document.entities[0].name).toBe('Cut line');
    expect(useEditorStore.getState().renameEntity(line.id, 'bad/name')).toBe(false);
    expect(useEditorStore.getState().document.entities[0].name).toBe('Cut line');
    expect(isValidEntityName('')).toBe(false);
  });
});

