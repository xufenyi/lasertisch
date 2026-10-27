import { afterEach, describe, expect, it, vi } from 'vitest';
import { booleanFixture } from '../test/booleanFixtures';
import { parseBooleanResponse } from '../domain/boolean';
import { requestBooleanOperation } from './booleanClient';

afterEach(() => { vi.unstubAllGlobals(); delete window.pywebview; });
describe('boolean response validation', () => {
  it('accepts canonical hole, island, ellipse and empty responses', () => {
    for (const name of ['hole','split','ellipse','empty']) {
      const f=booleanFixture(name);
      expect(parseBooleanResponse(f.raw,f.request)).toEqual(f.response);
    }
  });
  it('rejects stale identities, inconsistent flags and non-polygon results', () => {
    const f=booleanFixture();
    for (const update of [{requestId:'other'},{documentRevision:2},{empty:true},{ok:false},
      {result:{...f.raw.result,kind:'ellipse'}},{result:{...f.raw.result,parts:[]}}]) {
      expect(() => parseBooleanResponse({...f.raw,...update},f.request)).toThrow();
    }
  });
});
describe('boolean client transport', () => {
  it('sends the snapshot and ordered operands using the development bridge', async () => {
    const f=booleanFixture();
    vi.stubGlobal('fetch',vi.fn(async (_url: string,init: RequestInit) => {
      const request=JSON.parse(String(init.body));
      expect(request.operation).toBe('difference'); expect(request.operandAId).toBe(f.request.operandBId);
      expect(request.operandBId).toBe(f.request.operandAId); expect(request.document).toEqual(f.request.document);
      return new Response(JSON.stringify({...f.raw,requestId:request.requestId}),{status:200});
    }));
    const response=await requestBooleanOperation(f.request.document,1,'difference',f.request.operandBId,f.request.operandAId);
    expect(response.result).toEqual(f.response.result);
    expect(fetch).toHaveBeenCalledWith('/api/boolean',expect.objectContaining({method:'POST'}));
  });
  it('prefers the native desktop API and supports its JSON-string response', async () => {
    const f=booleanFixture(),fetchMock=vi.fn(); vi.stubGlobal('fetch',fetchMock);
    window.pywebview={api:{boolean_geometry:vi.fn(async (request) => JSON.stringify({...f.raw,requestId:request.requestId}))}};
    expect((await requestBooleanOperation(f.request.document,1,'union',f.request.operandAId,f.request.operandBId)).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects wrong revisions and preserves cancellation', async () => {
    const f=booleanFixture();
    vi.stubGlobal('fetch',vi.fn(async (_url: string,init: RequestInit) => {
      const request=JSON.parse(String(init.body));
      return new Response(JSON.stringify({...f.raw,requestId:request.requestId,documentRevision:99}),{status:200});
    }));
    await expect(requestBooleanOperation(f.request.document,1,'union',f.request.operandAId,f.request.operandBId)).rejects.toThrow(/identity/);
    vi.stubGlobal('fetch',vi.fn(async () => {throw new DOMException('cancelled','AbortError');}));
    await expect(requestBooleanOperation(f.request.document,1,'union',f.request.operandAId,f.request.operandBId)).rejects.toMatchObject({name:'AbortError'});
  });
});
