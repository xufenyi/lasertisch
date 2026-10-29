import { DEFAULT_PROCESS, type PointUm, type PolygonEntity, type PolygonPart, type ProcessSpec } from './model';
import type { ApiIssue } from './toolpath';

export interface FontReference {
  id: string; fingerprint: string; faceIndex: number;
  family: string; style: string; fullName: string; postscriptName: string;
  unitsPerEm: number; bundled: boolean;
}
export interface TextParameters {
  content: string; fontId?: string | null; fontSizeUm?: number; curveToleranceUm?: number; shortSegmentTargetUm?: number;
}
export interface TextSource {
  content: string; font: FontReference; fontSizeUm: number; curveToleranceUm: number; shortSegmentTargetUm: number; layout: 'single_line';
}
export interface TextOutlineSnapshot {
  source: TextSource; generatorVersion: 'font-outline-v1'; engineVersions: Record<string, string>;
  sourceHash: string; geometryHash: string; parts: PolygonPart[]; advanceUm: number; glyphCount: number;
}
export interface FontCatalogRequest { apiVersion: 1; requestId: string; includeSystem: boolean; refresh: boolean }
export interface FontCatalogResponse {
  apiVersion: 1; requestId: string; ok: boolean; defaultFontId: string | null;
  fonts: FontReference[]; errors: ApiIssue[]; warnings: ApiIssue[];
}
export interface TextOutlineRequest { apiVersion: 1; requestId: string; documentRevision: number; parameters: TextParameters }
export interface TextOutlineResponse {
  apiVersion: 1; requestId: string; documentRevision: number; ok: boolean;
  snapshot: TextOutlineSnapshot | null; errors: ApiIssue[]; warnings: ApiIssue[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid text contract');
  return value as Record<string, unknown>;
}
function string(value: unknown, maximum = 300): string {
  if (typeof value !== 'string' || !value.length || value.length > maximum) throw new Error('invalid text value');
  return value;
}
function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('invalid integer');
  return value;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('invalid boolean');
  return value;
}
function sha256(value: unknown): string {
  const text = string(value);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error('invalid fingerprint');
  return text;
}
function singleLine(value: unknown): string {
  const text = string(value, 512);
  if (Array.from(text).length > 256 || !text.trim() || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)) throw new Error('invalid single line');
  return text;
}
export function parseFontReference(value: unknown): FontReference {
  const source = record(value);
  const fingerprint = sha256(source.fingerprint), faceIndex = integer(source.faceIndex);
  if (source.id !== `${fingerprint}:${faceIndex}`) throw new Error('inconsistent font identity');
  return { id: source.id, fingerprint, faceIndex, family: string(source.family,200), style: string(source.style,200),
    fullName: string(source.fullName), postscriptName: string(source.postscriptName), unitsPerEm: integer(source.unitsPerEm,1,65536), bundled: boolean(source.bundled) };
}
function issues(value: unknown): ApiIssue[] {
  if (!Array.isArray(value)) throw new Error('invalid issues');
  return value.map((item) => {
    const source = record(item), parameters = record(source.parameters);
    if (Object.values(parameters).some((p) => p !== null && typeof p !== 'string' && typeof p !== 'boolean' &&
      (typeof p !== 'number' || !Number.isFinite(p)))) throw new Error('invalid issue parameters');
    return { code: string(source.code), parameters: parameters as ApiIssue['parameters'] };
  });
}
function identity(source: Record<string, unknown>, request: {requestId:string}) {
  if (source.apiVersion !== 1 || source.requestId !== request.requestId) throw new Error('response identity mismatch');
}
export function parseFontCatalogResponse(value: unknown, request: FontCatalogRequest): FontCatalogResponse {
  const source = record(value); identity(source,request);
  if (!Array.isArray(source.fonts)) throw new Error('invalid font list');
  const fonts = source.fonts.map(parseFontReference), errors = issues(source.errors), warnings = issues(source.warnings);
  const ok = boolean(source.ok), defaultFontId = source.defaultFontId === null ? null : string(source.defaultFontId);
  if (new Set(fonts.map((font) => font.id)).size !== fonts.length ||
    (ok && (errors.length || !fonts.length || !fonts.some((font) => font.id === defaultFontId))) ||
    (!ok && (!errors.length || fonts.length || defaultFontId !== null))) throw new Error('inconsistent font catalog');
  return { apiVersion:1,requestId:request.requestId,ok,defaultFontId,fonts,errors,warnings };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source).sort().map((key) => `${JSON.stringify(key)}:${canonical(source[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2,'0')).join('');
}
function parts(value: unknown): PolygonPart[] {
  if (!Array.isArray(value) || !value.length) throw new Error('invalid outline parts');
  let count = 0;
  const ring = (value: unknown): PointUm[] => {
    if (!Array.isArray(value) || value.length < 3 || (count += value.length) > 100_000) throw new Error('invalid outline ring');
    const points = value.map((raw) => { const p = record(raw); return { xUm:integer(p.xUm,-Number.MAX_SAFE_INTEGER),yUm:integer(p.yUm,-Number.MAX_SAFE_INTEGER) }; });
    let area = 0;
    points.forEach((p,i) => {
      const next = points[(i+1)%points.length];
      if (p.xUm === next.xUm && p.yUm === next.yUm) throw new Error('duplicated outline vertex');
      area += (p.xUm-points[0].xUm)*(next.yUm-points[0].yUm)-(next.xUm-points[0].xUm)*(p.yUm-points[0].yUm);
    });
    if (area === 0) throw new Error('degenerate outline ring');
    return points;
  };
  // The font engine validates full topology; linear checks and hashes keep large
  // API snapshots responsive. Project import retains its separate geometry gate.
  return value.map((raw) => {
    const part = record(raw);
    if (!Array.isArray(part.holes)) throw new Error('invalid holes');
    return { outerRing:ring(part.outerRing), holes:part.holes.map(ring) };
  });
}
export function parseTextSource(value: unknown): TextSource {
  const input=record(value);
  if(input.layout!=='single_line') throw new Error('unsupported text layout');
  return {content:singleLine(input.content),font:parseFontReference(input.font),fontSizeUm:integer(input.fontSizeUm,1,190_000),
    curveToleranceUm:integer(input.curveToleranceUm,1,1000),shortSegmentTargetUm:integer(input.shortSegmentTargetUm ?? 0,0,190_000),layout:'single_line'};
}
export async function parseTextSnapshot(value: unknown): Promise<TextOutlineSnapshot> {
  const raw = record(value);
  if (raw.generatorVersion !== 'font-outline-v1') throw new Error('unsupported text format');
  const source = parseTextSource(raw.source);
  const parsedParts = parts(raw.parts), engineVersions = record(raw.engineVersions);
  if (!Object.keys(engineVersions).length || Object.values(engineVersions).some((value) => typeof value !== 'string' || !value)) throw new Error('invalid engine versions');
  const sourceHash = sha256(raw.sourceHash), geometryHash = sha256(raw.geometryHash);
  if (await hash(source) !== sourceHash || await hash(parsedParts) !== geometryHash) throw new Error('text snapshot hash mismatch');
  return { source,generatorVersion:'font-outline-v1',engineVersions:engineVersions as Record<string,string>,
    sourceHash,geometryHash,parts:parsedParts,advanceUm:integer(raw.advanceUm),glyphCount:integer(raw.glyphCount,1) };
}
export async function parseTextOutlineResponse(value: unknown, request: TextOutlineRequest): Promise<TextOutlineResponse> {
  const source = record(value); identity(source,request);
  if (source.documentRevision !== request.documentRevision) throw new Error('text response revision mismatch');
  const ok = boolean(source.ok), errors = issues(source.errors), warnings = issues(source.warnings);
  const snapshot = source.snapshot === null ? null : await parseTextSnapshot(source.snapshot);
  if ((ok && (!snapshot || errors.length)) || (!ok && (snapshot || !errors.length))) throw new Error('inconsistent text response');
  if (snapshot && (snapshot.source.content !== request.parameters.content ||
    snapshot.source.fontSizeUm !== (request.parameters.fontSizeUm ?? 10_000) ||
    snapshot.source.curveToleranceUm !== (request.parameters.curveToleranceUm ?? 5) ||
    snapshot.source.shortSegmentTargetUm !== (request.parameters.shortSegmentTargetUm ?? 0) ||
    (request.parameters.fontId && snapshot.source.font.id !== request.parameters.fontId))) throw new Error('text source mismatch');
  return {apiVersion:1,requestId:request.requestId,documentRevision:request.documentRevision,ok,snapshot,errors,warnings};
}

export function textSnapshotToPolygon(snapshot: TextOutlineSnapshot, id: string, name: string,
  position: PointUm = {xUm:0,yUm:0}, rotationTenthsDeg = 0, process: ProcessSpec = DEFAULT_PROCESS): PolygonEntity {
  return { id,name,kind:'polygon',visible:true,locked:false,position:{...position},rotationTenthsDeg,
    process:{...process},parts:structuredClone(snapshot.parts) };
}
