import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument, serializeProjectDocument } from '../domain/projectFiles';
import type { PolygonEntity } from '../domain/model';
import { polygonRing } from '../domain/polygonEditing';
import { useEditorStore } from './editorStore';
import { handlePolygonKey } from '../editor/polygonKeyboard';

const store = () => useEditorStore.getState();
beforeEach(() => store().loadDocument(parseProjectDocument(JSON.stringify(fixture))));
const key = (key: string) => {
  const event = { key, preventDefault: vi.fn() };
  const handled = handlePolygonKey(event, 'Polygon');
  return { handled, event };
};

describe('polygon drafts and keyboard routing', () => {
  it('keeps drafts outside the project and commits a closed shape as one history entry', () => {
    store().setTool('polygon');
    const original = store().document;
    for (const point of [{xUm:0,yUm:0},{xUm:10_000,yUm:0},{xUm:0,yUm:10_000}]) store().appendPolygonPoint(point);
    expect(store().document).toBe(original);
    expect(store().undoStack).toHaveLength(0);
    expect(serializeProjectDocument(store().document)).not.toContain('polygonDraft');
    expect(key('Enter').handled).toBe(true);
    expect(store().document.entities).toHaveLength(5);
    expect(store().document.processingOrder).toHaveLength(5);
    expect(store().undoStack).toHaveLength(1);
    expect(store().tool).toBe('select');
    store().undo(); expect(store().document).toEqual(original);
    store().redo(); expect(store().document.entities).toHaveLength(5);
  });
  it('preserves invalid drafts for correction and handles deletion without deleting objects', () => {
    const count = store().document.entities.length;
    store().setTool('polygon');
    store().appendPolygonPoint({xUm:0,yUm:0});
    expect(store().appendPolygonPoint({xUm:0,yUm:0})).toBe(false);
    key('Enter'); expect(store().status).toBe('polygon.needThreeVertices');
    expect(store().polygonDraft).toHaveLength(1);
    key('Delete'); expect(store().polygonDraft).toHaveLength(1);
    key('Backspace'); expect(store().polygonDraft).toHaveLength(0);
    expect(store().document.entities).toHaveLength(count);
    store().appendPolygonPoint({xUm:0,yUm:0});
    store().undo(); expect(store().polygonDraft).toHaveLength(0);
    key('Escape'); expect(store().tool).toBe('select');
    expect(store().undoStack).toHaveLength(0);
  });
  it('rejects self-crossing and out-of-area points and cancels a draft on tool switching', () => {
    store().setTool('polygon');
    expect(store().appendPolygonPoint({xUm:100_000,yUm:0})).toBe(false);
    for (const point of [{xUm:0,yUm:0},{xUm:10_000,yUm:10_000},{xUm:0,yUm:10_000},{xUm:10_000,yUm:0}]) store().appendPolygonPoint(point);
    expect(store().finishPolygon()).toBe(false);
    expect(store().polygonDraft).toHaveLength(4);
    expect(store().undoStack).toHaveLength(0);
    store().setTool('line'); expect(store().polygonDraft).toHaveLength(0);
  });
});

describe('polygon vertex state', () => {
  const editHole = () => {
    store().startPolygonEdit(store().document.entities[2].id);
    store().selectPolygonVertex({partIndex:0,ringIndex:1,vertexIndex:0});
  };
  it('commits coordinate edits, insertion and deletion with reversible order-preserving history', () => {
    editHole(); const original = store().document, order = original.processingOrder;
    expect(store().moveSelectedVertex({xUm:-8000,yUm:-7000})).toBe(true);
    expect(store().insertSelectedVertex()).toBe(true);
    expect(store().polygonEdit?.vertex.vertexIndex).toBe(1);
    expect(store().deleteSelectedVertex()).toBe(true);
    expect(store().undoStack).toHaveLength(3);
    expect(store().document.processingOrder).toEqual(order);
    store().undo(); store().undo(); store().undo(); expect(store().document).toEqual(original);
    expect(store().polygonEdit?.entityId).toBe(original.entities[2].id);
  });
  it('rejects a hole moved outside its exterior and never records failed edits', () => {
    editHole(); const original = store().document;
    expect(store().moveSelectedVertex({xUm:90_000,yUm:0})).toBe(false);
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
  });
  it('deletes only the selected vertex and stops at a triangle', () => {
    store().startPolygonEdit(store().document.entities[0].id);
    key('Delete'); key('Backspace');
    const entity = store().document.entities[0] as PolygonEntity;
    expect(polygonRing(entity, store().polygonEdit!.vertex)).toHaveLength(3);
    const before = store().document;
    key('Delete'); expect(store().document).toBe(before);
    expect(store().status).toBe('polygon.minimumVertices');
    expect(store().document.entities).toHaveLength(4);
    key('Escape'); expect(store().polygonEdit).toBeNull();
    expect(store().selectionIds).toEqual([entity.id]);
  });
  it('exits editing on selection or tool changes, and clears transient data on cancel', () => {
    editHole(); store().setTransientEntities([store().document.entities[2]]);
    key('Escape'); expect(store().transientEntities).toEqual({});
    editHole(); store().setSelection([store().document.entities[0].id]); expect(store().polygonEdit).toBeNull();
    editHole(); store().setTool('pan'); expect(store().polygonEdit).toBeNull();
    editHole(); store().loadDocument(store().document); expect(store().polygonEdit).toBeNull();
  });
});
