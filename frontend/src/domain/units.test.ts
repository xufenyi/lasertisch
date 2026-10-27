import { describe, expect, it } from 'vitest';

import {
  formatTenthsDegrees,
  formatUmAsMillimetres,
  parseDegreesToTenths,
  parseMillimetresToUm,
} from './units';

describe('exact unit conversion', () => {
  it.each([
    ['12.345', 12_345],
    ['-4.567', -4_567],
    ['20,001', 20_001],
    ['0', 0],
  ])('parses %s mm as %i µm', (source, expected) => {
    expect(parseMillimetresToUm(source)).toBe(expected);
  });

  it('rejects precision finer than one micrometre', () => {
    expect(() => parseMillimetresToUm('1.0005')).toThrow();
  });

  it.each([
    [12_345, '12.345'],
    [-4_500, '-4.5'],
    [20_000, '20'],
  ])('formats %i µm without a floating-point round trip', (source, expected) => {
    expect(formatUmAsMillimetres(source)).toBe(expected);
  });
});

describe('clockwise angle conversion', () => {
  it.each([
    ['360', 0],
    ['361.1', 11],
    ['-0.1', 3599],
  ])('normalizes %s degrees', (source, expected) => {
    expect(parseDegreesToTenths(source)).toBe(expected);
  });

  it('formats tenths exactly', () => {
    expect(formatTenthsDegrees(123)).toBe('12.3');
  });
});

