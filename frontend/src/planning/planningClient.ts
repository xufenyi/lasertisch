import type { EditorDocument } from '../domain/model';
import { createEntityId } from '../domain/model';
import { parsePlanResponse, type PlanRequest, type PlanResponse } from '../domain/toolpath';

declare global {
  interface Window {
    pywebview?: {
      api?: {
        plan_toolpaths?: (request: PlanRequest) => Promise<unknown>;
      };
    };
  }
}

export class PlanningUnavailableError extends Error {}

export async function requestToolpathPlan(
  document: EditorDocument,
  documentRevision: number,
  signal?: AbortSignal,
): Promise<PlanResponse> {
  const request: PlanRequest = {
    apiVersion: 1,
    requestId: createEntityId(),
    documentRevision,
    document,
  };
  let raw: unknown;
  const desktopMethod = window.pywebview?.api?.plan_toolpaths;
  if (desktopMethod) {
    raw = await desktopMethod(request);
  } else if (import.meta.env.DEV) {
    let response: Response;
    try {
      response = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new PlanningUnavailableError('Python planning bridge is unavailable');
    }
    if (!response.ok) throw new PlanningUnavailableError(await response.text());
    raw = await response.json();
  } else {
    throw new PlanningUnavailableError('Python planning bridge is unavailable');
  }
  if (typeof raw === 'string') raw = JSON.parse(raw);
  const result = parsePlanResponse(raw);
  if (result.requestId !== request.requestId || result.documentRevision !== documentRevision) {
    throw new Error('Planning response identity does not match the request');
  }
  return result;
}
