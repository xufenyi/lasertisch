import { createEntityId, type EditorDocument } from '../domain/model';
import { parseBooleanResponse, type BooleanOperation, type BooleanRequest, type BooleanResponse } from '../domain/boolean';

export class BooleanUnavailableError extends Error {}

export async function requestBooleanOperation(
  document: EditorDocument, documentRevision: number, operation: BooleanOperation,
  operandAId: string, operandBId: string, signal?: AbortSignal,
): Promise<BooleanResponse> {
  const request: BooleanRequest = { apiVersion: 1, requestId: createEntityId(), documentRevision,
    document, operation, operandAId, operandBId };
  let raw: unknown;
  const native = window.pywebview?.api?.boolean_geometry;
  if (native) raw = await native(request);
  else if (import.meta.env.DEV) {
    let response: Response;
    try {
      response = await fetch('/api/boolean', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new BooleanUnavailableError('Boolean service is unavailable');
    }
    if (!response.ok) throw new BooleanUnavailableError('Boolean service is unavailable');
    raw = await response.json();
  } else throw new BooleanUnavailableError('Boolean service is unavailable');
  if (typeof raw === 'string') raw = JSON.parse(raw);
  return parseBooleanResponse(raw, request);
}
