import type { EditorDocument, PointUm } from './model';

export type LaserState = 'off' | 'on';
export type SegmentKind = 'travel' | 'contour' | 'hatch' | 'open_line';

export interface InitialJump {
  kind: 'initial_jump';
  start: null;
  end: PointUm;
  laser: 'off';
  speedUmPerSec: number;
}

export interface MotionSegment {
  sequence: number;
  kind: SegmentKind;
  laser: LaserState;
  start: PointUm;
  end: PointUm;
  speedUmPerSec: number;
  sourceEntityIds: string[];
  taskId: string;
}

export interface ToolpathTask {
  taskId: string;
  sourceEntityIds: string[];
  segments: MotionSegment[];
}

export interface ToolpathPlan {
  planId: string;
  inputRevision: number;
  preamble: InitialJump[];
  tasks: ToolpathTask[];
}

export interface ApiIssue {
  code: string;
  parameters: Record<string, string | number | boolean | null>;
}

export interface PlanRequest {
  apiVersion: 1;
  requestId: string;
  documentRevision: number;
  document: EditorDocument;
}

export interface PlanResponse {
  apiVersion: 1;
  requestId: string;
  documentRevision: number;
  ok: boolean;
  plan: ToolpathPlan | null;
  errors: ApiIssue[];
  warnings: ApiIssue[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${label} must be text`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  const result = nonNegativeInteger(value, label);
  if (!result) throw new Error(`${label} must be positive`);
  return result;
}

function point(value: unknown, label: string): PointUm {
  const source = record(value, label);
  const xUm = source.xUm;
  const yUm = source.yUm;
  if (!Number.isSafeInteger(xUm) || !Number.isSafeInteger(yUm)) {
    throw new Error(`${label} must contain integer coordinates`);
  }
  return { xUm: xUm as number, yUm: yUm as number };
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label} must be non-empty`);
  return value.map((item, index) => stringValue(item, `${label}[${index}]`));
}

function issue(value: unknown, label: string): ApiIssue {
  const source = record(value, label);
  return {
    code: stringValue(source.code, `${label}.code`),
    parameters: record(source.parameters, `${label}.parameters`) as ApiIssue['parameters'],
  };
}

function segment(value: unknown, label: string): MotionSegment {
  const source = record(value, label);
  const kind = source.kind;
  const laser = source.laser;
  if (!['travel', 'contour', 'hatch', 'open_line'].includes(String(kind))) {
    throw new Error(`${label}.kind is invalid`);
  }
  if (laser !== 'on' && laser !== 'off') throw new Error(`${label}.laser is invalid`);
  if ((kind === 'travel' && laser !== 'off') || (kind !== 'travel' && laser !== 'on')) {
    throw new Error(`${label} has inconsistent laser state`);
  }
  const start = point(source.start, `${label}.start`);
  const end = point(source.end, `${label}.end`);
  if (start.xUm === end.xUm && start.yUm === end.yUm) throw new Error(`${label} is zero length`);
  return {
    sequence: nonNegativeInteger(source.sequence, `${label}.sequence`),
    kind: kind as SegmentKind,
    laser,
    start,
    end,
    speedUmPerSec: positiveInteger(source.speedUmPerSec, `${label}.speedUmPerSec`),
    sourceEntityIds: stringArray(source.sourceEntityIds, `${label}.sourceEntityIds`),
    taskId: stringValue(source.taskId, `${label}.taskId`),
  };
}

function task(value: unknown, index: number): ToolpathTask {
  const source = record(value, `tasks[${index}]`);
  if (!Array.isArray(source.segments)) throw new Error(`tasks[${index}].segments must be an array`);
  return {
    taskId: stringValue(source.taskId, `tasks[${index}].taskId`),
    sourceEntityIds: stringArray(source.sourceEntityIds, `tasks[${index}].sourceEntityIds`),
    segments: source.segments.map((item, segmentIndex) => segment(
      item,
      `tasks[${index}].segments[${segmentIndex}]`,
    )),
  };
}

function plan(value: unknown): ToolpathPlan {
  const source = record(value, 'plan');
  if (!Array.isArray(source.preamble) || source.preamble.length !== 1 || !Array.isArray(source.tasks)) {
    throw new Error('plan preamble or tasks are invalid');
  }
  const jump = record(source.preamble[0], 'plan.preamble[0]');
  const end = point(jump.end, 'plan.preamble[0].end');
  if (
    jump.kind !== 'initial_jump' || jump.start !== null || jump.laser !== 'off' ||
    end.xUm !== 0 || end.yUm !== 0
  ) throw new Error('plan preamble is invalid');
  return {
    planId: stringValue(source.planId, 'plan.planId'),
    inputRevision: nonNegativeInteger(source.inputRevision, 'plan.inputRevision'),
    preamble: [{
      kind: 'initial_jump',
      start: null,
      end,
      laser: 'off',
      speedUmPerSec: positiveInteger(jump.speedUmPerSec, 'plan.preamble[0].speedUmPerSec'),
    }],
    tasks: source.tasks.map(task),
  };
}

export function parsePlanResponse(value: unknown): PlanResponse {
  const source = record(value, 'response');
  if (source.apiVersion !== 1 || typeof source.ok !== 'boolean') {
    throw new Error('unsupported planning response');
  }
  if (!Array.isArray(source.errors) || !Array.isArray(source.warnings)) {
    throw new Error('response issues are invalid');
  }
  const result: PlanResponse = {
    apiVersion: 1,
    requestId: stringValue(source.requestId, 'response.requestId'),
    documentRevision: nonNegativeInteger(source.documentRevision, 'response.documentRevision'),
    ok: source.ok,
    plan: source.plan === null ? null : plan(source.plan),
    errors: source.errors.map((item, index) => issue(item, `errors[${index}]`)),
    warnings: source.warnings.map((item, index) => issue(item, `warnings[${index}]`)),
  };
  if ((result.ok && (!result.plan || result.errors.length)) || (!result.ok && (result.plan || !result.errors.length))) {
    throw new Error('planning response success state is inconsistent');
  }
  return result;
}
