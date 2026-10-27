import { describe, expect, it } from 'vitest';

import type { ToolpathPlan } from '../domain/toolpath';
import { flattenToolpathSegments } from './toolpathRenderer';

describe('toolpath preview ordering', () => {
  it('flattens tasks in global segment sequence order', () => {
    const segment = (sequence: number) => ({
      sequence,
      kind: 'travel' as const,
      laser: 'off' as const,
      start: { xUm: sequence, yUm: 0 },
      end: { xUm: sequence + 1, yUm: 0 },
      speedUmPerSec: 1,
      sourceEntityIds: ['entity'],
      taskId: 'task',
    });
    const plan: ToolpathPlan = {
      planId: 'plan', inputRevision: 1,
      preamble: [{
        kind: 'initial_jump', start: null, end: { xUm: 0, yUm: 0 },
        laser: 'off', speedUmPerSec: 1,
      }],
      tasks: [
        { taskId: 'a', sourceEntityIds: ['a'], segments: [segment(2)] },
        { taskId: 'b', sourceEntityIds: ['b'], segments: [segment(0), segment(1)] },
      ],
    };
    expect(flattenToolpathSegments(plan).map((item) => item.sequence)).toEqual([0, 1, 2]);
  });
});
