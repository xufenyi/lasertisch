import { describe, expect, it } from 'vitest';

import { editShortcutFor } from './editShortcuts';

describe('copy and placement shortcuts', () => {
  it.each([
    ['c', true, false, 'copy'],
    ['V', true, false, 'paste'],
    ['d', false, true, 'duplicate'],
  ] as const)('maps %s with the platform modifier', (key, ctrl, meta, expected) => {
    expect(editShortcutFor(key, ctrl, meta, false, false)).toBe(expected);
  });

  it('leaves unmodified, Alt and Shift combinations available to other handlers', () => {
    expect(editShortcutFor('c', false, false, false, false)).toBeNull();
    expect(editShortcutFor('v', true, false, true, false)).toBeNull();
    expect(editShortcutFor('d', true, false, false, true)).toBeNull();
  });
});
