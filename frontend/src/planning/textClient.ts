import { createEntityId } from '../domain/model';
import { parseFontCatalogResponse, parseTextOutlineResponse, type FontCatalogRequest, type TextOutlineRequest, type TextParameters } from '../domain/text';

export class TextServiceUnavailableError extends Error {}

async function post<T extends object>(route: string, request: T, native: ((request: T) => Promise<unknown>) | undefined, signal?: AbortSignal): Promise<unknown> {
  let raw: unknown;
  if (native) raw = await native(request);
  else if (import.meta.env.DEV) {
    let response: Response;
    try { response = await fetch(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal}); }
    catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new TextServiceUnavailableError('Text service unavailable');
    }
    if (!response.ok) throw new TextServiceUnavailableError('Text service unavailable');
    raw = await response.json();
  } else throw new TextServiceUnavailableError('Text service unavailable');
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}
export async function requestFontCatalog(includeSystem = true, refresh = false, signal?: AbortSignal) {
  const request: FontCatalogRequest = {apiVersion:1,requestId:createEntityId(),includeSystem,refresh};
  return parseFontCatalogResponse(await post('/api/fonts',request,window.pywebview?.api?.font_catalog,signal),request);
}
export async function requestTextOutline(parameters: TextParameters, documentRevision: number, signal?: AbortSignal) {
  const request: TextOutlineRequest = {apiVersion:1,requestId:createEntityId(),documentRevision,parameters};
  return parseTextOutlineResponse(await post('/api/text-outline',request,window.pywebview?.api?.text_outline,signal),request);
}
