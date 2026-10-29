import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../../../fixtures/editable-text-v2.lasertisch.json';
import missing from '../../../fixtures/text-missing-font-v2.lasertisch.json';
import type { TextEntity } from '../domain/model';
import { parseProjectDocument,serializeProjectDocument } from '../domain/projectFiles';
import { shortEdgeStatistics } from '../domain/textGeometry';
import { useEditorStore } from './editorStore';

const store=()=>useEditorStore.getState();
const text=()=>store().document.entities[0] as TextEntity;
beforeEach(()=>store().loadDocument(parseProjectDocument(JSON.stringify(fixture))));
describe('editable text history and storage',()=>{
  it('keeps saved outlines without font discovery and round-trips missing font identity',()=>{
    const document=parseProjectDocument(JSON.stringify(missing));
    expect(parseProjectDocument(serializeProjectDocument(document))).toEqual(document);
    expect(document.entities[0].kind).toBe('text');
    expect(()=>parseProjectDocument(JSON.stringify({...fixture,schemaVersion:1}))).toThrow();
    const malformed=structuredClone(fixture);malformed.entities[0].text.content='A\nB';
    expect(()=>parseProjectDocument(JSON.stringify(malformed))).toThrow();
  });
  it('commits a preview once and preserves id, order and process on regeneration',()=>{
    const before=structuredClone(store().document),original=text();
    store().beginText(original.position,original.id);const session=store().textSession!;
    const candidate={...original,text:{...original.text,content:'Other'},process:{...original.process,hatchSpacingUm:999}};
    expect(store().setTextPreview(candidate,session.id)).toBe(true);
    expect(store().document).toEqual(before);expect(store().undoStack).toHaveLength(0);
    expect(store().applyTextPreview(session.id)).toBe(true);
    expect(text().text.content).toBe('Other');expect(text().process).toEqual(original.process);
    expect(store().document.processingOrder).toEqual(before.processingOrder);expect(store().undoStack).toHaveLength(1);
    store().undo();expect(store().document).toEqual(before);
    store().redo();expect(text().text.content).toBe('Other');
  });
  it('creates a text entity only on apply and cancellation leaves history untouched',()=>{
    store().beginText({xUm:0,yUm:0});const session=store().textSession!;
    const candidate={...text(),id:'00000000-0000-0000-0000-000000000999',position:{xUm:0,yUm:0}};
    expect(store().setTextPreview(candidate,session.id)).toBe(true);
    store().cancelText();expect(store().undoStack).toHaveLength(0);
    expect(store().applyTextPreview(session.id)).toBe(false);
    store().beginText(candidate.position);const next=store().textSession!;
    store().setTextPreview(candidate,next.id);expect(store().applyTextPreview(next.id)).toBe(true);
    expect(store().document.entities.at(-1)).toEqual(candidate);expect(store().undoStack).toHaveLength(1);
  });
  it('rejects stale and out-of-area previews, and protects locked source text',()=>{
    const original=text();store().beginText(original.position,original.id);const session=store().textSession!;
    expect(store().setTextPreview({...original,position:{xUm:999999,yUm:0}},session.id)).toBe(false);
    store().updateProjectName('changed');expect(store().textSession).toBeNull();
    expect(store().setTextPreview(original,session.id)).toBe(false);expect(store().applyTextPreview(session.id)).toBe(false);
    store().replaceEntities([{...text(),locked:true}]);store().beginText(original.position,original.id);
    expect(store().textSession).toBeNull();
  });
  it('converts to a polygon reversibly and computes world short-edge statistics',()=>{
    const original=structuredClone(text());store().convertTextToPolygon(original.id);
    const polygon=store().document.entities[0];expect(polygon.kind).toBe('polygon');expect('text' in polygon).toBe(false);
    expect('parts' in polygon && polygon.parts).toEqual(original.parts);
    store().undo();expect(text()).toEqual(original);
    const stats=shortEdgeStatistics(original,200);expect(stats.vertices).toBe(495);expect(stats.shortEdges.length).toBeGreaterThan(0);
  });
});
