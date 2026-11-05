import { beforeEach, describe, expect, it } from 'vitest';

import { createEmptyDocument, DEFAULT_PROCESS, type LineEntity } from '../domain/model';
import { isValidEntityName, useEditorStore } from './editorStore';
import polygonProject from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument, serializeProjectDocument } from '../domain/projectFiles';
import type { PolygonEntity } from '../domain/model';

const line: LineEntity = {
  id: 'line-1',
  kind: 'line',
  name: 'Line 1',
  process: DEFAULT_PROCESS,
  start: { xUm: 0, yUm: 0 },
  end: { xUm: 1_000, yUm: 0 },
};

beforeEach(() => {
  const document = createEmptyDocument();
  useEditorStore.setState({
    document,
    documentRevision: 0,
    entityWorkspaceStates: {},
    selectionIds: [],
    transientEntities: {},
    clipboard: null,
    placementSession: null,
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

  it('starts new objects with a 0.08 mm hatch spacing', () => {
    expect(useEditorStore.getState().document.defaultProcess.hatchSpacingUm).toBe(80);
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

  it('keeps visibility and locking workspace-only and outside document history', () => {
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().markSaved();
    const document = useEditorStore.getState().document;
    const historyLength = useEditorStore.getState().undoStack.length;

    useEditorStore.getState().toggleEntityVisibility(line.id);
    useEditorStore.getState().toggleEntityLocked(line.id);
    const state = useEditorStore.getState();
    expect(state.document).toBe(document);
    expect(state.entityWorkspaceStates[line.id]).toEqual({ visible: false, locked: true });
    expect(state.undoStack).toHaveLength(historyLength);
    expect(state.isDirty).toBe(false);
    expect(serializeProjectDocument(state.document)).not.toContain('"locked"');

    state.newProject();
    expect(useEditorStore.getState().entityWorkspaceStates).toEqual({});
  });

  it('blocks content changes for locked objects while allowing rename and reordering', () => {
    const second = { ...line, id: 'line-2', name: 'Line 2' };
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().addEntity(second);
    useEditorStore.getState().setSelection([line.id]);
    useEditorStore.getState().toggleEntityLocked(line.id);
    const document = useEditorStore.getState().document;

    useEditorStore.getState().replaceEntities([{ ...line, end: { xUm: 5_000, yUm: 0 } }]);
    expect(useEditorStore.getState().updateSelectedProcess({ markSpeedUmPerSec: 123_000 })).toBe(false);
    useEditorStore.getState().deleteSelected();
    expect(useEditorStore.getState().document).toBe(document);
    expect(useEditorStore.getState().status).toBe('error.entityLocked');

    expect(useEditorStore.getState().renameEntity(line.id, 'Protected')).toBe(true);
    useEditorStore.getState().moveProcessingOrder(line.id, 1);
    expect(useEditorStore.getState().document.processingOrder).toEqual([second.id, line.id]);
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

  it('moves processing order to any destination as one undoable change', () => {
    const second = { ...line, id: 'line-2', name: 'Line 2' };
    const third = { ...line, id: 'line-3', name: 'Line 3' };
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().addEntity(second);
    useEditorStore.getState().addEntity(third);
    const historyLength = useEditorStore.getState().undoStack.length;
    useEditorStore.getState().moveProcessingOrder(third.id, 0);
    expect(useEditorStore.getState().document.processingOrder).toEqual([third.id, line.id, second.id]);
    expect(useEditorStore.getState().document.entities.map((entity) => entity.id)).toEqual([line.id, second.id, third.id]);
    expect(useEditorStore.getState().undoStack).toHaveLength(historyLength + 1);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document.processingOrder).toEqual([line.id, second.id, third.id]);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.processingOrder).toEqual([third.id, line.id, second.id]);
  });

  it('commits one polygon drag, undoes it, and retains the new shape on save', () => {
    useEditorStore.getState().loadDocument(parseProjectDocument(JSON.stringify(polygonProject)));
    const original = useEditorStore.getState().document;
    const entity = original.entities[0] as PolygonEntity;
    const update = { ...entity, position: { xUm:-40_000, yUm:45_000 }, rotationTenthsDeg: 300 };
    useEditorStore.getState().setTransientEntities([update]);
    expect(useEditorStore.getState().undoStack).toHaveLength(0);
    useEditorStore.getState().replaceEntities([update]);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    expect(useEditorStore.getState().document.processingOrder).toEqual(original.processingOrder);
    const saved = serializeProjectDocument(useEditorStore.getState().document);
    expect(parseProjectDocument(saved).entities[0]).toEqual(update);
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().document).toEqual(original);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.entities[0]).toEqual(update);
  });

  it('rejects invalid polygon replacements without adding history', () => {
    useEditorStore.getState().loadDocument(parseProjectDocument(JSON.stringify(polygonProject)));
    const original = useEditorStore.getState().document;
    const entity = original.entities[0] as PolygonEntity;
    useEditorStore.getState().replaceEntities([{ ...entity, position: { xUm:100_000, yUm:0 } }]);
    expect(useEditorStore.getState().document).toBe(original);
    expect(useEditorStore.getState().undoStack).toHaveLength(0);
    expect(useEditorStore.getState().status).toBe('error.invalidPolygon');
  });

  it('copies a snapshot and pastes multiple objects as one atomic operation', () => {
    useEditorStore.getState().loadDocument(parseProjectDocument(JSON.stringify(polygonProject)));
    const original = useEditorStore.getState().document;
    const selected = [original.entities[0].id, original.entities[2].id];
    useEditorStore.getState().setSelection(selected);
    useEditorStore.getState().toggleEntityVisibility(selected[0]);
    useEditorStore.getState().toggleEntityLocked(selected[1]);
    expect(useEditorStore.getState().copySelected()).toBe(true);
    expect(useEditorStore.getState().document).toBe(original);
    expect(useEditorStore.getState().undoStack).toHaveLength(0);

    useEditorStore.getState().renameEntity(selected[0], 'Changed after copy');
    const beforePaste = useEditorStore.getState().document;
    expect(useEditorStore.getState().beginPastePlacement()).toBe(true);
    expect(useEditorStore.getState().movePlacement({ xUm: 0, yUm: 0 })).toBe(true);
    const candidates = useEditorStore.getState().placementSession!.candidates;
    const candidateStates = useEditorStore.getState().placementSession!.workspaceStates;
    expect(candidateStates[candidates[0].id]).toEqual({ visible: false, locked: false });
    expect(candidateStates[candidates[1].id]).toEqual({ visible: true, locked: true });
    expect(candidates.map((entity) => entity.name)).toEqual([
      original.entities[0].name,
      original.entities[2].name,
    ]);
    expect(useEditorStore.getState().commitPlacement()).toBe(true);

    const state = useEditorStore.getState();
    expect(state.document.entities).toHaveLength(original.entities.length + 2);
    expect(state.selectionIds).toEqual(candidates.map((entity) => entity.id));
    expect(state.entityWorkspaceStates[candidates[0].id]).toEqual({ visible: false, locked: false });
    expect(state.entityWorkspaceStates[candidates[1].id]).toEqual({ visible: true, locked: true });
    const idMap = new Map(selected.map((id, index) => [id, candidates[index].id]));
    expect(state.document.processingOrder.slice(-2)).toEqual(
      original.processingOrder.filter((id) => selected.includes(id)).map((id) => idMap.get(id)),
    );
    expect(state.undoStack.at(-1)).toBe(beforePaste);
    state.undo();
    expect(useEditorStore.getState().document).toBe(beforePaste);
    useEditorStore.getState().redo();
    expect(useEditorStore.getState().document.entities).toHaveLength(original.entities.length + 2);
  });

  it('duplicates without overwriting the clipboard and Esc-style cancellation changes nothing', () => {
    useEditorStore.getState().addEntity(line);
    expect(useEditorStore.getState().copySelected()).toBe(true);
    const clipboard = useEditorStore.getState().clipboard;
    const second = { ...line, id: '00000000-0000-0000-0000-000000000222', name: 'Second' };
    useEditorStore.getState().addEntity(second);
    const original = useEditorStore.getState().document;
    expect(useEditorStore.getState().beginDuplicatePlacement()).toBe(true);
    expect(useEditorStore.getState().clipboard).toBe(clipboard);
    useEditorStore.getState().movePlacement({ xUm: 20_000, yUm: 20_000 });
    useEditorStore.getState().cancelPlacement();
    expect(useEditorStore.getState().document).toBe(original);
    expect(useEditorStore.getState().undoStack).toHaveLength(2);
    expect(useEditorStore.getState().selectionIds).toEqual([second.id]);
  });

  it('resets pasted workspace state when the clipboard crosses projects', () => {
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().toggleEntityVisibility(line.id);
    useEditorStore.getState().toggleEntityLocked(line.id);
    useEditorStore.getState().copySelected();
    useEditorStore.getState().newProject();
    expect(useEditorStore.getState().beginPastePlacement()).toBe(true);
    const session = useEditorStore.getState().placementSession!;
    expect(session.workspaceStates[session.candidates[0].id]).toEqual({ visible: true, locked: false });
  });

  it('keeps an out-of-bounds placement pending and rejects a group too large for a new work area', () => {
    useEditorStore.getState().addEntity(line);
    useEditorStore.getState().copySelected();
    const original = useEditorStore.getState().document;
    useEditorStore.getState().beginPastePlacement();
    expect(useEditorStore.getState().movePlacement({ xUm: 95_000, yUm: 95_000 })).toBe(false);
    expect(useEditorStore.getState().commitPlacement()).toBe(false);
    expect(useEditorStore.getState().document).toBe(original);
    expect(useEditorStore.getState().placementSession).not.toBeNull();

    useEditorStore.getState().newProject();
    expect(useEditorStore.getState().updateWorkArea({
      widthUm: 500,
      heightUm: 500,
      center: { xUm: 0, yUm: 0 },
    })).toBe(true);
    expect(useEditorStore.getState().beginPastePlacement()).toBe(false);
    expect(useEditorStore.getState().status).toBe('clipboard.cannotFit');
  });
});

