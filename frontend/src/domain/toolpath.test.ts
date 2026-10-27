import { describe, expect, it } from 'vitest';

import { parsePlanResponse } from './toolpath';

const response = {
  apiVersion: 1,
  requestId: '00000000-0000-0000-0000-000000000099',
  documentRevision: 4,
  ok: true,
  plan: {
    planId: '00000000-0000-0000-0000-000000000100',
    inputRevision: 4,
    preamble: [{
      kind: 'initial_jump', start: null, end: { xUm: 0, yUm: 0 },
      laser: 'off', speedUmPerSec: 10_000_000,
    }],
    tasks: [{
      taskId: 'task', sourceEntityIds: ['entity'],
      segments: [{
        sequence: 0, kind: 'travel', laser: 'off',
        start: { xUm: 0, yUm: 0 }, end: { xUm: 1_000, yUm: 0 },
        speedUmPerSec: 10_000_000, sourceEntityIds: ['entity'], taskId: 'task',
      }, {
        sequence: 1, kind: 'open_line', laser: 'on',
        start: { xUm: 1_000, yUm: 0 }, end: { xUm: 2_000, yUm: 0 },
        speedUmPerSec: 900_000, sourceEntityIds: ['entity'], taskId: 'task',
      }],
    }],
  },
  errors: [],
  warnings: [],
};

describe('planning response parsing', () => {
  it('accepts explicit travel and mark semantics', () => {
    const parsed = parsePlanResponse(response);
    expect(parsed.plan?.tasks[0].segments.map((segment) => segment.laser)).toEqual(['off', 'on']);
  });

  it('rejects inconsistent laser state', () => {
    const invalid = structuredClone(response);
    invalid.plan.tasks[0].segments[0].laser = 'on';
    expect(() => parsePlanResponse(invalid)).toThrow(/laser state/);
  });
});
