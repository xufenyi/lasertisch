import type { Canvas } from 'fabric';
import { worldToScene, type ScenePoint } from '../domain/geometry';
import type { PointUm, PolygonEntity, WorkAreaSettings } from '../domain/model';
import type { PolygonVertexAddress } from '../domain/polygonEditing';
import { polygonWorldPoint } from '../domain/polygonGeometry';

export function polygonHandles(entity: PolygonEntity, area: WorkAreaSettings) {
  return entity.parts.flatMap((part, partIndex) => [part.outerRing, ...part.holes].flatMap((ring, ringIndex) =>
    ring.map((point, vertexIndex) => ({
      address: { partIndex, ringIndex, vertexIndex }, point,
      scene: worldToScene(polygonWorldPoint(entity, point), area),
    }))));
}

export function findPolygonVertex(entity: PolygonEntity, point: ScenePoint, zoom: number, area: WorkAreaSettings): PolygonVertexAddress | null {
  let distance = (8 / zoom) ** 2, nearest: PolygonVertexAddress | null = null;
  for (const handle of polygonHandles(entity, area)) {
    const current = (point.x - handle.scene.x) ** 2 + (point.y - handle.scene.y) ** 2;
    if (current <= distance) { distance = current; nearest = handle.address; }
  }
  return nearest;
}

export function findPolygonEdge(entity: PolygonEntity, point: ScenePoint, zoom: number, area: WorkAreaSettings): { address: PolygonVertexAddress; localPoint: PointUm } | null {
  let distance = (6 / zoom) ** 2;
  let nearest: { address: PolygonVertexAddress; localPoint: PointUm } | null = null;
  entity.parts.forEach((part, partIndex) => [part.outerRing, ...part.holes].forEach((ring, ringIndex) => {
    ring.forEach((a, vertexIndex) => {
      const b = ring[(vertexIndex + 1) % ring.length];
      const start = worldToScene(polygonWorldPoint(entity, a), area), end = worldToScene(polygonWorldPoint(entity, b), area);
      const dx = end.x - start.x, dy = end.y - start.y, length = dx * dx + dy * dy;
      if (!length) return;
      const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length));
      const current = (point.x - start.x - ratio * dx) ** 2 + (point.y - start.y - ratio * dy) ** 2;
      if (current <= distance) {
        distance = current;
        nearest = { address: { partIndex, ringIndex, vertexIndex }, localPoint: {
          xUm: Math.round(a.xUm + (b.xUm - a.xUm) * ratio), yUm: Math.round(a.yUm + (b.yUm - a.yUm) * ratio),
        } };
      }
    });
  }));
  return nearest;
}

export function isNearPolygonStart(draft: PointUm[], point: ScenePoint, zoom: number, area: WorkAreaSettings): boolean {
  if (!draft.length) return false;
  const first = worldToScene(draft[0], area);
  return Math.hypot(point.x - first.x, point.y - first.y) * zoom <= 8;
}

export function drawPolygonOverlay(
  canvas: Canvas, element: HTMLCanvasElement | null, area: WorkAreaSettings,
  draft: PointUm[], cursor: PointUm | null, entity: PolygonEntity | null,
  selected: PolygonVertexAddress | null, invalidPoint: PointUm | null,
): void {
  if (!element) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.getWidth(), height = canvas.getHeight();
  if (element.width !== Math.round(width * dpr) || element.height !== Math.round(height * dpr)) {
    element.width = Math.round(width * dpr); element.height = Math.round(height * dpr);
  }
  const ctx = element.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
  const viewport = canvas.viewportTransform;
  const screen = (point: ScenePoint) => ({ x: point.x * viewport[0] + point.y * viewport[2] + viewport[4],
    y: point.x * viewport[1] + point.y * viewport[3] + viewport[5] });
  const dot = (point: ScenePoint, active: boolean, first = false) => {
    ctx.beginPath(); ctx.arc(point.x, point.y, active ? 6 : first ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#ef8b16' : '#ffffff'; ctx.strokeStyle = '#1666a7'; ctx.lineWidth = 1.5;
    ctx.fill(); ctx.stroke();
    if (first) { ctx.beginPath(); ctx.arc(point.x, point.y, 2, 0, Math.PI * 2); ctx.fillStyle = '#1666a7'; ctx.fill(); }
  };
  if (draft.length) {
    const points = draft.map((point) => screen(worldToScene(point, area)));
    ctx.strokeStyle = '#1666a7'; ctx.lineWidth = 1.5;
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    if (cursor) {
      const p = screen(worldToScene(cursor, area)), last = points[points.length - 1];
      ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y);
      if (points.length >= 2) ctx.lineTo(points[0].x, points[0].y);
      ctx.stroke(); ctx.setLineDash([]);
    }
    points.forEach((point, index) => dot(point, false, index === 0));
  }
  if (entity) {
    for (const handle of polygonHandles(entity, area)) {
      const a = handle.address;
      dot(screen(handle.scene), a.partIndex === selected?.partIndex && a.ringIndex === selected.ringIndex && a.vertexIndex === selected.vertexIndex);
    }
  }
  if (invalidPoint) {
    const p = screen(worldToScene(invalidPoint, area));
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(p.x - 5, p.y - 5); ctx.lineTo(p.x + 5, p.y + 5);
    ctx.moveTo(p.x - 5, p.y + 5); ctx.lineTo(p.x + 5, p.y - 5); ctx.stroke();
  }
}
