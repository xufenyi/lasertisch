import { describe, expect, it } from 'vitest';

import { parseNativeOpenResult, parseNativeSaveResult } from './desktopBridge';

describe('native desktop bridge', () => {
  it('parses open and save results', () => {
    expect(parseNativeOpenResult({
      status: 'ok', filename: 'part.json', content: '{}',
    })).toEqual({ status: 'ok', filename: 'part.json', content: '{}' });
    expect(parseNativeSaveResult({ status: 'cancelled' })).toEqual({ status: 'cancelled' });
  });

  it('rejects incomplete native responses', () => {
    expect(() => parseNativeOpenResult({ status: 'ok', filename: 'part.json' })).toThrow();
    expect(() => parseNativeSaveResult({ status: 'error' })).toThrow();
  });
});
