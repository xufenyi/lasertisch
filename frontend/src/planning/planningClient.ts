import type { EditorDocument } from '../domain/model';
import { createEntityId } from '../domain/model';
import {
  parseExportResponse,
  parsePlanResponse,
  type ExportFormat,
  type ExportRequest,
  type ExportResponse,
  type PlanRequest,
  type PlanResponse,
  type ToolpathPlan,
} from '../domain/toolpath';

export class PlanningUnavailableError extends Error {}
export class ExportUnavailableError extends Error {}

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

export async function requestDeviceExport(
  plan: ToolpathPlan,
  documentRevision: number,
  format: ExportFormat,
): Promise<ExportResponse> {
  const request: ExportRequest = {
    apiVersion: 1,
    requestId: createEntityId(),
    documentRevision,
    format,
    plan,
  };
  let raw: unknown;
  const desktopMethod = window.pywebview?.api?.export_device_program;
  if (desktopMethod) {
    raw = await desktopMethod(request);
  } else if (import.meta.env.DEV) {
    let response: Response;
    try {
      response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new ExportUnavailableError('Python export bridge is unavailable');
    }
    if (!response.ok) throw new ExportUnavailableError(await response.text());
    raw = await response.json();
  } else {
    throw new ExportUnavailableError('Python export bridge is unavailable');
  }
  if (typeof raw === 'string') raw = JSON.parse(raw);
  const result = parseExportResponse(raw);
  if (result.requestId !== request.requestId || result.documentRevision !== documentRevision) {
    throw new Error('Export response identity does not match the request');
  }
  if (result.ok && result.format !== format) {
    throw new Error('Export response format does not match the request');
  }
  return result;
}
