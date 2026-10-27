import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './editorStore';
import { booleanDocument, booleanFixture } from '../test/booleanFixtures';
import { serializeProjectDocument } from '../domain/projectFiles';
import type { PolygonEntity } from '../domain/model';

const store = () => useEditorStore.getState();
beforeEach(() => store().loadDocument(booleanDocument()));
function preview(name = 'union') {
  const data = booleanFixture(name, store().documentRevision).preview;
  store().setSelection([data.operandAId,data.operandBId]);
  expect(store().setBooleanPreview(data)).toBe(true);
  return data;
}

describe('atomic boolean document edits', () => {
  it('keeps previews outside the project and replaces A/B with a single reversible result', () => {
    const original = store().document, p = preview();
    expect(store().document).toBe(original); expect(store().isDirty).toBe(false);
    expect(store().undoStack).toHaveLength(0);
    expect(serializeProjectDocument(store().document)).not.toContain('booleanPreview');
    expect(store().applyBooleanPreview(p.requestId,false,false,'并集结果')).toBe(true);
    expect(store().document.entities).toHaveLength(7);
    expect(store().document.processingOrder).toEqual([p.result!.id,...original.processingOrder.slice(2)]);
    expect(store().selectionIds).toEqual([p.result!.id]); expect(store().booleanPreview).toBeNull();
    const result = store().document.entities[0] as PolygonEntity;
    expect(result).toMatchObject({kind:'polygon',name:'并集结果',process:original.entities[0].process});
    expect(store().undoStack).toHaveLength(1);
    store().undo(); expect(store().document).toEqual(original);
    store().redo(); expect(store().document.entities[0]).toEqual(result);
  });
  it('places a replacement at A even when B occurs earlier in the fixed processing order', () => {
    const document = booleanDocument(), ids=document.processingOrder;
    document.processingOrder=[ids[2],ids[1],ids[3],ids[0],...ids.slice(4)];
    store().loadDocument(document); const p=preview();
    store().applyBooleanPreview(p.requestId,false,false,'结果');
    expect(store().document.processingOrder).toEqual([ids[2],ids[3],p.result!.id,...ids.slice(4)]);
  });
  it('keeps originals and their parameters and inserts the result immediately after A', () => {
    const original=store().document, p=preview();
    store().applyBooleanPreview(p.requestId,true,false,'保留原对象结果');
    expect(store().document.entities).toHaveLength(9);
    expect(store().document.entities.find((item) => item.id===p.operandAId)).toBe(original.entities[0]);
    expect(store().document.entities.find((item) => item.id===p.operandBId)).toBe(original.entities[1]);
    expect(store().document.processingOrder).toEqual([p.operandAId,p.result!.id,...original.processingOrder.slice(1)]);
  });
  it('requires explicit confirmation before applying an empty result', () => {
    const original=store().document,p=preview('empty');
    expect(store().applyBooleanPreview(p.requestId,false,false,'结果')).toBe(false);
    expect(store().applyBooleanPreview(p.requestId,true,true,'结果')).toBe(false);
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
    expect(store().applyBooleanPreview(p.requestId,false,true,'结果')).toBe(true);
    expect(store().document.entities).toHaveLength(6); expect(store().selectionIds).toEqual([]);
    store().undo(); expect(store().document).toEqual(original);
  });
  it('invalidates previews on document, selection, tool and transient changes', () => {
    let p=preview(); store().renameEntity(p.operandAId,'更名');
    expect(store().booleanPreview).toBeNull();
    const afterRename=store().document;
    expect(store().applyBooleanPreview(p.requestId,false,false,'过期结果')).toBe(false);
    expect(store().document).toBe(afterRename);
    p=preview(); store().setSelection([p.operandBId,p.operandAId]); expect(store().booleanPreview).toBeNull();
    p=preview(); store().setTool('pan'); expect(store().booleanPreview).toBeNull();
    store().setTool('select'); p=preview(); store().setTransientEntities([store().document.entities[0]]);
    expect(store().booleanPreview).toBeNull(); expect(store().setBooleanPreview(p)).toBe(false);
  });
  it('rejects stale, colliding and invalid geometry responses before previewing', () => {
    const p=booleanFixture('union',store().documentRevision).preview;
    store().setSelection([p.operandAId,p.operandBId]);
    expect(store().setBooleanPreview({...p,documentRevision:p.documentRevision-1})).toBe(false);
    expect(store().setBooleanPreview({...p,result:{...p.result!,id:p.operandAId}})).toBe(false);
    expect(store().setBooleanPreview({...p,result:{...p.result!,position:{xUm:200_000,yUm:0}}})).toBe(false);
    expect(store().setBooleanPreview({...p,empty:true})).toBe(false);
    expect(store().undoStack).toHaveLength(0);
  });
  it('keeps hole and disconnected result geometry intact when applied and saved', () => {
    for (const name of ['hole','split','ellipse']) {
      store().loadDocument(booleanDocument());const p=preview(name);
      expect(store().applyBooleanPreview(p.requestId,false,false,'结果')).toBe(true);
      const result=store().document.entities.find((item) => item.id===p.result!.id) as PolygonEntity;
      expect(result.parts).toEqual(p.result!.parts);
      expect(serializeProjectDocument(store().document)).toContain('polygon');
    }
  });
});
