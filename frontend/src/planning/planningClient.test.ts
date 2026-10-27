import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEmptyDocument } from '../domain/model';
import { requestToolpathPlan } from './planningClient';

afterEach(() => vi.unstubAllGlobals());

describe('planning client', () => {
  it('sends the canonical document and accepts the matching revision', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        apiVersion: 1,
        requestId: request.requestId,
        documentRevision: request.documentRevision,
        ok: true,
        plan: {
          planId: 'plan', inputRevision: request.documentRevision,
          preamble: [{
            kind: 'initial_jump', start: null, end: { xUm: 0, yUm: 0 },
            laser: 'off', speedUmPerSec: 10_000_000,
          }],
          tasks: [],
        },
        errors: [], warnings: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const response = await requestToolpathPlan(createEmptyDocument(), 12);
    expect(response.documentRevision).toBe(12);
    expect(response.plan?.inputRevision).toBe(12);
  });

  it('rejects a response for another document revision', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return new Response(JSON.stringify({
        apiVersion: 1,
        requestId: request.requestId,
        documentRevision: request.documentRevision + 1,
        ok: true,
        plan: {
          planId: 'plan', inputRevision: request.documentRevision + 1,
          preamble: [{
            kind: 'initial_jump', start: null, end: { xUm: 0, yUm: 0 },
            laser: 'off', speedUmPerSec: 10_000_000,
          }],
          tasks: [],
        },
        errors: [], warnings: [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    await expect(requestToolpathPlan(createEmptyDocument(), 12)).rejects.toThrow(/identity/);
  });
});
