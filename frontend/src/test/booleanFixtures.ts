import project from '../../../fixtures/booleans-v2.lasertisch.json';
import results from '../../../fixtures/boolean-results.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { parseBooleanResponse, type BooleanOperation, type BooleanPreview, type BooleanRequest } from '../domain/boolean';

export const booleanDocument = () => parseProjectDocument(JSON.stringify(project));
export function booleanFixture(name = 'union', revision = 1) {
  const sample = results.find((item) => item.name === name)!;
  const request: BooleanRequest = { apiVersion: 1, requestId: '00000000-0000-4000-8000-000000000500',
    documentRevision: revision, document: booleanDocument(), operation: sample.operation as BooleanOperation,
    operandAId: sample.operandAId, operandBId: sample.operandBId };
  const raw = { apiVersion: 1, requestId: request.requestId, documentRevision: revision,
    ok: true, result: sample.result, empty: sample.empty, errors: [], warnings: [] };
  const response = parseBooleanResponse(raw, request);
  const preview: BooleanPreview = { ...response, operation: request.operation, operandAId: request.operandAId, operandBId: request.operandBId };
  return { request, raw, response, preview };
}
