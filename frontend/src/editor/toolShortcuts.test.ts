import { describe, expect, it } from 'vitest';

import {
  isFitWorkAreaShortcut,
  toolForShortcut,
  TOOL_SHORTCUT_KEY,
} from './toolShortcuts';

describe('tool shortcuts', () => {
  it('maps the four editor tools to their advertised single keys', () => {
    expect(TOOL_SHORTCUT_KEY).toEqual({ select: 'V', pan: 'H', line: 'L', rectangle: 'R' });
    expect(['V', 'h', 'L', 'r'].map(toolForShortcut))
      .toEqual(['select', 'pan', 'line', 'rectangle']);
  });

  it('recognizes the Photoshop-style fit shortcut on Windows and macOS', () => {
    expect(isFitWorkAreaShortcut('0', true, false, false)).toBe(true);
    expect(isFitWorkAreaShortcut('0', false, true, false)).toBe(true);
    expect(isFitWorkAreaShortcut('0', false, false, false)).toBe(false);
    expect(isFitWorkAreaShortcut('0', true, false, true)).toBe(false);
  });
});
