import { describe, expect, it } from 'vitest';

import exampleProject from '../../../fixtures/project-v1.example.json';
import { createEmptyDocument } from './model';
import {
  parseProjectDocument,
  projectFilename,
  serializeProjectDocument,
} from './projectFiles';

describe('project files', () => {
  it('round-trips a canonical empty document without precision loss', () => {
    const source = createEmptyDocument('Precision test');
    const parsed = parseProjectDocument(serializeProjectDocument(source));
    expect(parsed).toEqual(source);
  });

  it('loads the backend contract fixture', () => {
    const parsed = parseProjectDocument(JSON.stringify(exampleProject));
    expect(parsed.entities[0]).toMatchObject({
      kind: 'rectangle',
      center: { xUm: 12_345, yUm: -4_567 },
      widthUm: 20_001,
    });
  });

  it('rejects incomplete processing order and unsafe document data', () => {
    const source = createEmptyDocument();
    source.entities = [{
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'line',
      name: 'Line',
      visible: true,
      locked: false,
      process: { ...source.defaultProcess },
      start: { xUm: 0, yUm: 0 },
      end: { xUm: 1_000, yUm: 0 },
    }];
    expect(() => parseProjectDocument(serializeProjectDocument(source))).toThrow(/processingOrder/);
  });

  it('creates a safe project filename', () => {
    expect(projectFilename('part: 01/02')).toBe('part_ 01_02.lasertisch.json');
  });
});
