import type { EditorDocument, PolygonEntity } from './model';
import type { ApiIssue } from './toolpath';
import { parseProjectDocument } from './projectFiles';

export type BooleanOperation = 'union' | 'intersection' | 'difference';
export interface BooleanRequest {
  apiVersion: 1;
  requestId: string;
  documentRevision: number;
  document: EditorDocument;
  operation: BooleanOperation;
  operandAId: string;
  operandBId: string;
}
export interface BooleanResponse {
  apiVersion: 1;
  requestId: string;
  documentRevision: number;
  ok: boolean;
  result: PolygonEntity | null;
  empty: boolean;
  errors: ApiIssue[];
  warnings: ApiIssue[];
}
export interface BooleanPreview {
  requestId: string;
  documentRevision: number;
  operation: BooleanOperation;
  operandAId: string;
  operandBId: string;
  result: PolygonEntity | null;
  empty: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid boolean response');
  return value as Record<string, unknown>;
}
function issues(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) throw new Error('invalid boolean issues');
  return value.map((item) => {
    const source = record(item), parameters = record(source.parameters);
    if (typeof source.code !== 'string' || !/^[a-z][a-z0-9_.-]*$/.test(source.code) ||
      Object.values(parameters).some((parameter) => parameter !== null && typeof parameter !== 'string' &&
        typeof parameter !== 'boolean' && (typeof parameter !== 'number' || !Number.isFinite(parameter)))) {
      throw new Error('invalid boolean issue');
    }
    return { code: source.code, parameters: parameters as ApiIssue['parameters'] };
  });
}

export function parseBooleanResponse(value: unknown, request: BooleanRequest): BooleanResponse {
  const source = record(value);
  if (source.apiVersion !== 1 || source.requestId !== request.requestId || source.documentRevision !== request.documentRevision) {
    throw new Error('boolean response identity does not match request');
  }
  if (typeof source.ok !== 'boolean' || typeof source.empty !== 'boolean') throw new Error('invalid boolean result flags');
  let result: PolygonEntity | null = null;
  if (source.result !== null) {
    const raw = record(source.result);
    if (raw.kind !== 'polygon') throw new Error('boolean result must be a polygon');
    const document = parseProjectDocument(JSON.stringify({ ...request.document, entities: [raw], processingOrder: [raw.id] }));
    result = document.entities[0] as PolygonEntity;
  }
  const errors = issues(source.errors), warnings = issues(source.warnings);
  if ((source.ok && (errors.length > 0 || source.empty !== (result === null))) ||
    (!source.ok && (!errors.length || result !== null || source.empty))) throw new Error('inconsistent boolean response');
  return { apiVersion: 1, requestId: request.requestId, documentRevision: request.documentRevision,
    ok: source.ok, result, empty: source.empty, errors, warnings };
}
