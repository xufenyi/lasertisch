import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../../../fixtures/default-font-catalog-v1.json';
import examples from '../../../fixtures/text-outline-snapshots-v1.json';
import project from '../../../fixtures/text-outlines-v2.lasertisch.json';
import { parseProjectDocument, serializeProjectDocument } from './projectFiles';
import { parseFontCatalogResponse, parseTextOutlineResponse, parseTextSnapshot, textSnapshotToPolygon, type TextOutlineRequest } from './text';
import { requestFontCatalog, requestTextOutline, TextServiceUnavailableError } from '../planning/textClient';

beforeEach(() => vi.stubGlobal('crypto',webcrypto));
afterEach(() => {vi.unstubAllGlobals();delete window.pywebview;});
const catalogRequest = {apiVersion:1 as const,requestId:catalog.requestId,includeSystem:false,refresh:false};
const snapshot = examples[0].snapshot;
const request: TextOutlineRequest = {apiVersion:1,requestId:catalog.requestId,documentRevision:7,
  parameters:{content:snapshot.source.content,fontId:snapshot.source.font.id,fontSizeUm:snapshot.source.fontSizeUm,curveToleranceUm:snapshot.source.curveToleranceUm}};
const response = {apiVersion:1,requestId:request.requestId,documentRevision:7,ok:true,snapshot,errors:[],warnings:[]};

describe('text outline contracts', () => {
  it('loads every Python snapshot and its polygon without font access', async () => {
    const parsed = parseProjectDocument(JSON.stringify(project));
    expect(parseProjectDocument(serializeProjectDocument(parsed))).toEqual(parsed);
    for (const example of examples) {
      const outline = await parseTextSnapshot(example.snapshot);
      const entity = parsed.entities.find((item) => item.id === example.entityId)!;
      expect(entity.kind).toBe('polygon');
      if (entity.kind !== 'polygon') throw new Error('Expected polygon');
      expect(outline.parts).toEqual(entity.parts);
      const polygon = textSnapshotToPolygon(outline,entity.id,entity.name,entity.position);
      expect(polygon.parts).toEqual(entity.parts);
      polygon.parts[0].outerRing[0].xUm += 1;
      expect(polygon.parts).not.toEqual(outline.parts);
    }
  });
  it('accepts catalog identities and rejects missing defaults or duplicate fonts', () => {
    expect(parseFontCatalogResponse(catalog,catalogRequest).fonts).toHaveLength(1);
    for (const changed of [{defaultFontId:'missing'},{fonts:[...catalog.fonts,...catalog.fonts]},
      {fonts:[{...catalog.fonts[0],faceIndex:2}]},{requestId:'stale'},{ok:false}]) {
      expect(() => parseFontCatalogResponse({...catalog,...changed},catalogRequest)).toThrow();
    }
  });
  it('rejects tampered sources, vertices and unsupported versions', async () => {
    for (const change of [(s: typeof snapshot) => {s.source.content='other';},
      (s: typeof snapshot) => {s.parts[0].outerRing[0].xUm++;},
      (s: typeof snapshot) => {s.parts[0].outerRing[1]={...s.parts[0].outerRing[0]};},
      (s: typeof snapshot) => {s.source.content='A\nB';},
      (s: typeof snapshot) => {s.generatorVersion='unknown';}]) {
      const changed=structuredClone(snapshot);change(changed);
      await expect(parseTextSnapshot(changed)).rejects.toThrow();
    }
  });
  it('rejects stale revisions, substituted fonts and mismatched source parameters', async () => {
    expect((await parseTextOutlineResponse(response,request)).ok).toBe(true);
    for (const update of [{documentRevision:8},{requestId:'stale'},{ok:false},{snapshot:null}]) {
      await expect(parseTextOutlineResponse({...response,...update},request)).rejects.toThrow();
    }
    for (const parameters of [{...request.parameters,fontId:'missing'},{...request.parameters,content:'other'},
      {...request.parameters,fontSizeUm:1},{...request.parameters,curveToleranceUm:1},{...request.parameters,shortSegmentTargetUm:100}]) {
      await expect(parseTextOutlineResponse(response,{...request,parameters})).rejects.toThrow();
    }
  });
});

describe('text transport', () => {
  it('prefers native APIs and accepts JSON-string results', async () => {
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    window.pywebview={api:{font_catalog:vi.fn(async (r) => JSON.stringify({...catalog,requestId:r.requestId})),
      text_outline:vi.fn(async (r) => JSON.stringify({...response,requestId:r.requestId,documentRevision:r.documentRevision}))}};
    expect((await requestFontCatalog(false,true)).defaultFontId).toBe(catalog.defaultFontId);
    expect((await requestTextOutline(request.parameters,7)).snapshot?.geometryHash).toBe(snapshot.geometryHash);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('passes source parameters and cancellation to the development endpoint', async () => {
    const controller=new AbortController();
    vi.stubGlobal('fetch',vi.fn(async (url: string,init: RequestInit) => {
      const sent=JSON.parse(String(init.body));expect(sent.parameters).toEqual(request.parameters);
      expect(url).toBe('/api/text-outline');expect(init.signal).toBe(controller.signal);
      return new Response(JSON.stringify({...response,requestId:sent.requestId}),{status:200});
    }));
    expect((await requestTextOutline(request.parameters,7,controller.signal)).ok).toBe(true);
  });
  it('preserves aborts and reports unavailable service', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => {throw new DOMException('cancelled','AbortError');}));
    await expect(requestFontCatalog()).rejects.toMatchObject({name:'AbortError'});
    vi.stubGlobal('fetch',vi.fn(async () => new Response('',{status:500})));
    await expect(requestFontCatalog()).rejects.toBeInstanceOf(TextServiceUnavailableError);
  });
});
