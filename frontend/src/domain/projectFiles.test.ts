import { describe, expect, it } from 'vitest';

import exampleProject from '../../../fixtures/project-v1.example.json';
import polygonProject from '../../../fixtures/polygons-v2.lasertisch.json';
import { createEmptyDocument } from './model';
import { polygonWorldParts } from './polygonGeometry';
import type { PolygonEntity } from './model';
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
    expect(parsed.schemaVersion).toBe(2);
  });

  it('round-trips a v2 polygon project with holes and disconnected parts', () => {
    const parsed = parseProjectDocument(JSON.stringify(polygonProject));
    expect(parseProjectDocument(serializeProjectDocument(parsed))).toEqual(parsed);
    expect(parsed.entities[2]).toMatchObject({ kind: 'polygon', rotationTenthsDeg: 150 });
  });

  it('accepts legacy entity view flags but never writes workspace state', () => {
    const parsed = parseProjectDocument(JSON.stringify(polygonProject));
    expect('visible' in parsed.entities[0]).toBe(false);
    expect('locked' in parsed.entities[0]).toBe(false);
    const saved = JSON.parse(serializeProjectDocument(parsed));
    expect(saved.grid.visible).toBe(true);
    expect(saved.entities.every((item: Record<string, unknown>) =>
      !('visible' in item) && !('locked' in item))).toBe(true);
  });

  it('migrates world-coordinate v1 polygons without changing their world vertices', () => {
    const legacy = { ...polygonProject, schemaVersion: 1, entities: polygonProject.entities.map((entity) => {
      const { position, rotationTenthsDeg, ...worldPolygon } = entity;
      return worldPolygon;
    }) };
    const parsed = parseProjectDocument(JSON.stringify(legacy));
    const entity = parsed.entities[0] as PolygonEntity;
    expect(entity.rotationTenthsDeg).toBe(0);
    expect(polygonWorldParts(entity)).toEqual(legacy.entities[0].parts);
    expect(parsed.schemaVersion).toBe(2);
  });

  it('rejects invalid topology, out-of-bounds placement and unknown versions', () => {
    const invalid = structuredClone(polygonProject);
    invalid.entities[2].parts[0].holes[0][0] = { xUm: 90_000, yUm: 90_000 };
    expect(() => parseProjectDocument(JSON.stringify(invalid))).toThrow(/topology/);
    expect(() => parseProjectDocument(JSON.stringify({ ...polygonProject, schemaVersion: 3 }))).toThrow(/schema/);
    const outside = structuredClone(polygonProject);
    outside.entities[0].position.xUm = 95_000;
    expect(() => parseProjectDocument(JSON.stringify(outside))).toThrow(/outside/);
  });

  it('rejects incomplete processing order and unsafe document data', () => {
    const source = createEmptyDocument();
    source.entities = [{
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'line',
      name: 'Line',
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
