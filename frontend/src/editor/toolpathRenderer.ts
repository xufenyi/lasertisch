import type { Canvas } from 'fabric';

import { worldToScene } from '../domain/geometry';
import type { WorkAreaSettings } from '../domain/model';
import type { MotionSegment, ToolpathPlan } from '../domain/toolpath';

interface ScreenPoint { x: number; y: number }

export function flattenToolpathSegments(plan: ToolpathPlan): MotionSegment[] {
  return plan.tasks.flatMap((task) => task.segments).sort((a, b) => a.sequence - b.sequence);
}

function prepareCanvas(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, element.clientWidth);
  const height = Math.max(1, element.clientHeight);
  if (element.width !== Math.round(width * dpr) || element.height !== Math.round(height * dpr)) {
    element.width = Math.round(width * dpr);
    element.height = Math.round(height * dpr);
  }
  const context = element.getContext('2d');
  if (!context) return null;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function screenPoint(
  point: { xUm: number; yUm: number },
  workArea: WorkAreaSettings,
  viewport: number[],
): ScreenPoint {
  const scene = worldToScene(point, workArea);
  return {
    x: scene.x * viewport[0] + scene.y * viewport[2] + viewport[4],
    y: scene.x * viewport[1] + scene.y * viewport[3] + viewport[5],
  };
}

function strokeSegments(
  context: CanvasRenderingContext2D,
  segments: MotionSegment[],
  workArea: WorkAreaSettings,
  viewport: number[],
  color: string,
  width: number,
  dash: number[] = [],
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.beginPath();
  for (const segment of segments) {
    const start = screenPoint(segment.start, workArea, viewport);
    const end = screenPoint(segment.end, workArea, viewport);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.stroke();
  context.restore();
}

function arrow(
  context: CanvasRenderingContext2D,
  start: ScreenPoint,
  end: ScreenPoint,
  color: string,
): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < 24) return;
  const x = start.x + dx * 0.68;
  const y = start.y + dy * 0.68;
  const angle = Math.atan2(dy, dx);
  const size = 4.5;
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  context.lineTo(x + Math.cos(angle + 2.55) * size, y + Math.sin(angle + 2.55) * size);
  context.lineTo(x + Math.cos(angle - 2.55) * size, y + Math.sin(angle - 2.55) * size);
  context.closePath();
  context.fill();
  context.restore();
}

function endpoint(
  context: CanvasRenderingContext2D,
  point: ScreenPoint,
  color: string,
  label: string,
): void {
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.arc(point.x, point.y, 4, 0, Math.PI * 2);
  context.fill();
  context.font = 'bold 10px "Segoe UI", sans-serif';
  context.fillText(label, point.x + 6, point.y - 5);
  context.restore();
}

export function drawToolpathPreview(
  fabricCanvas: Canvas,
  overlay: HTMLCanvasElement | null,
  plan: ToolpathPlan | null,
  workArea: WorkAreaSettings,
  visible: boolean,
): void {
  if (!overlay) return;
  const context = prepareCanvas(overlay);
  if (!context || !visible || !plan) return;
  const viewport = fabricCanvas.viewportTransform;
  const segments = flattenToolpathSegments(plan);
  const travel = segments.filter((segment) => segment.kind === 'travel');
  const hatch = segments.filter((segment) => segment.kind === 'hatch');
  const contour = segments.filter((segment) => segment.kind === 'contour');
  const open = segments.filter((segment) => segment.kind === 'open_line');

  strokeSegments(context, travel, workArea, viewport, 'rgba(78, 91, 101, 0.66)', 1, [5, 4]);
  strokeSegments(context, hatch, workArea, viewport, 'rgba(245, 124, 0, 0.82)', 1.2);
  strokeSegments(context, contour, workArea, viewport, 'rgba(211, 47, 47, 0.9)', 1.8);
  strokeSegments(context, open, workArea, viewport, 'rgba(211, 47, 47, 0.9)', 1.8);

  for (const segment of segments) {
    if (segment.laser !== 'on') continue;
    const color = segment.kind === 'hatch' ? '#f57c00' : '#d32f2f';
    arrow(
      context,
      screenPoint(segment.start, workArea, viewport),
      screenPoint(segment.end, workArea, viewport),
      color,
    );
  }

  context.save();
  context.font = 'bold 11px "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  plan.tasks.forEach((task, index) => {
    const firstMark = task.segments.find((segment) => segment.laser === 'on');
    if (!firstMark) return;
    const point = screenPoint(firstMark.start, workArea, viewport);
    context.fillStyle = '#263238';
    context.beginPath();
    context.arc(point.x, point.y, 8, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.fillText(String(index + 1), point.x, point.y + 0.5);
  });
  context.restore();

  const origin = screenPoint({ xUm: 0, yUm: 0 }, workArea, viewport);
  endpoint(context, origin, '#2e7d32', 'S');
  const last = segments.at(-1);
  if (last) endpoint(context, screenPoint(last.end, workArea, viewport), '#c62828', 'E');
}
