import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/ellipses-v2.lasertisch.json';
import { parseProjectDocument, serializeProjectDocument } from '../domain/projectFiles';
import type { EllipseEntity, PolygonEntity } from '../domain/model';
import { ellipseToPolygon } from '../domain/ellipseGeometry';
import { polygonWorldParts } from '../domain/polygonGeometry';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();
beforeEach(() => store().loadDocument(parseProjectDocument(JSON.stringify(fixture))));
describe('ellipse document edits', () => {
  it('changes sides without altering dimensions or process and can undo and save', () => {
    const original = store().document, entity = original.entities[0] as EllipseEntity;
    const update = {...entity,sides:5};
    store().replaceEntities([update]);
    expect(store().undoStack).toHaveLength(1);
    expect(parseProjectDocument(serializeProjectDocument(store().document)).entities[0]).toEqual(update);
    store().undo(); expect(store().document).toEqual(original);
    store().redo(); expect(store().document.entities[0]).toEqual(update);
  });
  it('converts to editable vertices without changing physical geometry, identity or processing order', () => {
    const original = store().document, entity = original.entities[2] as EllipseEntity;
    store().setSelection([entity.id]);
    expect(store().convertEllipseToPolygon(entity.id)).toBe(true);
    const result = store().document.entities[2] as PolygonEntity;
    expect(result.kind).toBe('polygon');
    expect(polygonWorldParts(result)).toEqual(polygonWorldParts(ellipseToPolygon(entity)));
    expect(result.id).toBe(entity.id); expect(result.name).toBe(entity.name); expect(result.process).toEqual(entity.process);
    expect(store().document.processingOrder).toEqual(original.processingOrder);
    expect(store().selectionIds).toEqual([entity.id]); expect(store().undoStack).toHaveLength(1);
    store().startPolygonEdit(entity.id); expect(store().polygonEdit?.entityId).toBe(entity.id);
    store().undo(); expect(store().document).toEqual(original); expect(store().polygonEdit).toBeNull();
  });
  it('rejects invalid parameter changes without history', () => {
    const original = store().document, entity = original.entities[0] as EllipseEntity;
    store().replaceEntities([{...entity,sides:2}]);
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
    expect(store().status).toBe('error.invalidEllipse');
  });
  it('does not convert a locked ellipse', () => {
    const entity = store().document.entities[0] as EllipseEntity;
    store().replaceEntities([{...entity,locked:true}]);
    const original = store().document, history = store().undoStack.length;
    expect(store().convertEllipseToPolygon(entity.id)).toBe(false);
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(history);
  });
});
