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
  const document = createEmptyDocument();
  useEditorStore.setState({
    document,
    documentRevision: 0,
    selectionIds: [],
    transientEntities: {},
    tool: 'select',
    status: null,
    undoStack: [],
    redoStack: [],
    savedFingerprint: JSON.stringify(document),
    isDirty: false,
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

  it('undoes and redoes one committed operation', () => {
    useEditorStore.getState().addEntity(line);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().isDirty).toBe(true);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.entities).toEqual([]);
    expect(useEditorStore.getState().redoStack).toHaveLength(1);
    expect(useEditorStore.getState().isDirty).toBe(false);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.entities).toEqual([line]);
  });

  it('batch-updates only selected process data', () => {
    const second = { ...line, id: 'line-2', name: 'Line 2' };
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().addEntity(second);
    useEditorStore.getState().setSelection([line.id, second.id]);
    expect(useEditorStore.getState().updateSelectedProcess({ markSpeedUmPerSec: 123_000 })).toBe(true);
    expect(useEditorStore.getState().document.entities.map((entity) => entity.process.markSpeedUmPerSec))
      .toEqual([123_000, 123_000]);
  });

  it('moves processing order without changing geometry order', () => {
    const second = { ...line, id: 'line-2', name: 'Line 2' };
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().addEntity(second);
    useEditorStore.getState().moveProcessingOrder(second.id, -1);
    expect(useEditorStore.getState().document.processingOrder).toEqual([second.id, line.id]);
    expect(useEditorStore.getState().document.entities.map((entity) => entity.id)).toEqual([line.id, second.id]);
  });
});

