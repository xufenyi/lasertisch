import type {
  ExportFormat,
  ExportRequest,
  PlanRequest,
} from '../domain/toolpath';
import type { BooleanRequest } from '../domain/boolean';
import type { FontCatalogRequest, TextOutlineRequest } from '../domain/text';

export type NativeSaveResult =
  | { status: 'ok'; filename: string }
  | { status: 'cancelled' }
  | { status: 'error'; code: string };

export type NativeOpenResult =
  | { status: 'ok'; filename: string; content: string }
  | { status: 'cancelled' }
  | { status: 'error'; code: string };

declare global {
  interface Window {
    pywebview?: {
      api?: {
        plan_toolpaths?: (request: PlanRequest) => Promise<unknown>;
        boolean_geometry?: (request: BooleanRequest) => Promise<unknown>;
        font_catalog?: (request: FontCatalogRequest) => Promise<unknown>;
        text_outline?: (request: TextOutlineRequest) => Promise<unknown>;
        export_device_program?: (request: ExportRequest) => Promise<unknown>;
        open_project_file?: () => Promise<unknown>;
        save_project_file?: (filename: string, content: string) => Promise<unknown>;
        save_device_file?: (
          filename: string,
          contentBase64: string,
          format: ExportFormat,
        ) => Promise<unknown>;
      };
    };
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Native file response must be an object');
  }
  return value as Record<string, unknown>;
}

function commonResult(value: unknown): Record<string, unknown> {
  const source = record(value);
  if (!['ok', 'cancelled', 'error'].includes(String(source.status))) {
    throw new Error('Native file response status is invalid');
  }
  if (source.status === 'error' && (typeof source.code !== 'string' || !source.code)) {
    throw new Error('Native file error code is invalid');
  }
  return source;
}

export function parseNativeSaveResult(value: unknown): NativeSaveResult {
  const source = commonResult(value);
  if (source.status === 'ok') {
    if (typeof source.filename !== 'string' || !source.filename) {
      throw new Error('Native save filename is invalid');
    }
    return { status: 'ok', filename: source.filename };
  }
  if (source.status === 'error') return { status: 'error', code: source.code as string };
  return { status: 'cancelled' };
}

export function parseNativeOpenResult(value: unknown): NativeOpenResult {
  const source = commonResult(value);
  if (source.status === 'ok') {
    if (
      typeof source.filename !== 'string' || !source.filename ||
      typeof source.content !== 'string'
    ) throw new Error('Native open payload is invalid');
    return { status: 'ok', filename: source.filename, content: source.content };
  }
  if (source.status === 'error') return { status: 'error', code: source.code as string };
  return { status: 'cancelled' };
}
