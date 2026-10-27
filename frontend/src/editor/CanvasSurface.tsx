import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { ActiveSelection, Canvas, FabricObject, Line, Point, Rect } from 'fabric';

import {
  clampPoint,
  constrainDrawingEnd,
  isPointInWorkArea,
  isRectangleInWorkArea,
  sceneToWorld,
  snapPoint,
  workAreaSceneSize,
  worldToScene,
} from '../domain/geometry';
import {
  BASE_PIXELS_PER_MM,
  createEntityId,
  type EditableEntity,
  type EntityId,
  type PointUm,
  type ProcessSpec,
  type Tool,
  type WorkAreaSettings,
} from '../domain/model';
import { useEditorStore } from '../state/editorStore';
import {
  createReferenceObjects,
  entityToFabricObject,
  fabricObjectToEntity,
  getEntityId,
  LINE_STROKE_PX,
  RECTANGLE_STROKE_PX,
  snapObjectCenterForMove,
  type ProjectionOptions,
  updateScreenStrokeWidths,
} from './fabricAdapter';

export interface CanvasSurfaceHandle {
  fitWorkArea: () => void;
}

interface DrawSession {
  tool: 'rectangle' | 'line';
  start: PointUm;
  preview: Rect | Line;
}

interface PanSession { x: number; y: number }

function selectedIds(target: FabricObject | undefined): EntityId[] {
  if (!target) return [];
  if (target instanceof ActiveSelection) {
    return target.getObjects().map(getEntityId).filter((id): id is string => Boolean(id));
  }
  const id = getEntityId(target);
  return id ? [id] : [];
}

function sameSelection(first: EntityId[], second: EntityId[]): boolean {
  if (first.length !== second.length) return false;
  const secondIds = new Set(second);
  return first.every((id) => secondIds.has(id));
}

function fitWorkArea(canvas: Canvas, workArea: WorkAreaSettings): void {
  const size = workAreaSceneSize(workArea);
  const padding = 36;
  const zoom = Math.max(
    0.05,
    Math.min(
      (canvas.getWidth() - padding * 2) / size.x,
      (canvas.getHeight() - padding * 2) / size.y,
    ),
  );
  canvas.setViewportTransform([
    zoom, 0, 0, zoom,
    (canvas.getWidth() - size.x * zoom) / 2,
    (canvas.getHeight() - size.y * zoom) / 2,
  ]);
  canvas.requestRenderAll();
}

function applySelection(canvas: Canvas, registry: Map<EntityId, FabricObject>, ids: EntityId[]): void {
  canvas.discardActiveObject();
  const objects = ids.map((id) => registry.get(id)).filter((item): item is FabricObject => Boolean(item));
  if (objects.length === 1) canvas.setActiveObject(objects[0]);
  else if (objects.length > 1) {
    const selection = new ActiveSelection(objects, { canvas });
    selection.set({ hasControls: false, lockRotation: true, lockScalingX: true, lockScalingY: true });
    canvas.setActiveObject(selection);
  }
  canvas.requestRenderAll();
}

function configureGeometryInteraction(
  registry: Map<EntityId, FabricObject>,
  entities: EditableEntity[],
  tool: Tool,
): void {
  const selecting = tool === 'select';
  const lockedById = new Map(entities.map((entity) => [entity.id, entity.locked]));
  for (const [id, object] of registry) {
    const interactive = selecting && !lockedById.get(id);
    object.set({
      selectable: interactive,
      evented: interactive,
      hoverCursor: selecting ? 'move' : 'default',
      moveCursor: selecting ? 'move' : 'default',
    });
  }
}

function rebuildCanvas(
  canvas: Canvas,
  registry: Map<EntityId, FabricObject>,
  suppressSelection: React.MutableRefObject<boolean>,
): void {
  const { document, selectionIds, tool } = useEditorStore.getState();
  const viewport = [...canvas.viewportTransform] as [number, number, number, number, number, number];
  suppressSelection.current = true;
  canvas.clear();
  canvas.backgroundColor = '#e8eef3';
  canvas.setViewportTransform(viewport);
  registry.clear();
  const zoom = canvas.getZoom();
  canvas.add(...createReferenceObjects(document.grid, document.workArea, zoom));
  for (const entity of document.entities) {
    const object = entityToFabricObject(entity, document.workArea, zoom);
    registry.set(entity.id, object);
    canvas.add(object);
  }
  configureGeometryInteraction(registry, document.entities, tool);
  canvas.selection = tool === 'select';
  if (tool === 'select') applySelection(canvas, registry, selectionIds);
  else canvas.discardActiveObject();
  suppressSelection.current = false;
}

function pointerWorld(scenePoint: Point, snap: boolean): PointUm {
  const state = useEditorStore.getState();
  const point = clampPoint(sceneToWorld(scenePoint, state.document.workArea), state.document.workArea);
  return snap ? snapPoint(point, state.document.grid.spacingUm, state.document.workArea) : point;
}

function rectangleFromDrag(
  start: PointUm,
  end: PointUm,
  sequence: number,
  workArea: WorkAreaSettings,
  defaultProcess: ProcessSpec,
): EditableEntity | null {
  const widthUm = Math.abs(end.xUm - start.xUm);
  const heightUm = Math.abs(end.yUm - start.yUm);
  if (!widthUm || !heightUm) return null;
  const entity: EditableEntity = {
    id: createEntityId(), kind: 'rectangle', name: `Rectangle ${sequence}`,
    visible: true, locked: false, process: { ...defaultProcess },
    center: { xUm: Math.round((start.xUm + end.xUm) / 2), yUm: Math.round((start.yUm + end.yUm) / 2) },
    widthUm, heightUm, rotationTenthsDeg: 0,
  };
  return isRectangleInWorkArea(entity, workArea) ? entity : null;
}

function lineFromDrag(
  start: PointUm,
  end: PointUm,
  sequence: number,
  workArea: WorkAreaSettings,
  defaultProcess: ProcessSpec,
): EditableEntity | null {
  if (
    (start.xUm === end.xUm && start.yUm === end.yUm) ||
    !isPointInWorkArea(start, workArea) ||
    !isPointInWorkArea(end, workArea)
  ) return null;
  return {
    id: createEntityId(), kind: 'line', name: `Line ${sequence}`,
    visible: true,
    locked: false,
    process: {
      ...defaultProcess,
      mode: defaultProcess.mode === 'none' ? 'none' : 'contour',
    },
    start,
    end,
  };
}

function createPreview(
  tool: 'rectangle' | 'line',
  start: PointUm,
  workArea: WorkAreaSettings,
  zoom: number,
): Rect | Line {
  const scene = worldToScene(start, workArea);
  if (tool === 'rectangle') {
    return new Rect({
      left: scene.x, top: scene.y, width: 0, height: 0,
      originX: 'left', originY: 'top',
      fill: 'rgba(39, 120, 194, 0.13)',
      stroke: '#1666a7',
      strokeWidth: RECTANGLE_STROKE_PX / zoom,
      selectable: false, evented: false, objectCaching: false,
    });
  }
  return new Line([scene.x, scene.y, scene.x, scene.y], {
    stroke: '#d84315',
    strokeWidth: LINE_STROKE_PX / zoom,
    selectable: false,
    evented: false,
  });
}

function updatePreview(session: DrawSession, current: PointUm, workArea: WorkAreaSettings): void {
  const start = worldToScene(session.start, workArea);
  const end = worldToScene(current, workArea);
  if (session.preview instanceof Rect) {
    session.preview.set({
      left: Math.min(start.x, end.x), top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
    });
    session.preview.dirty = true;
  } else session.preview.set({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
  session.preview.setCoords();
}

function chooseRulerStep(zoom: number): number {
  return [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].find(
    (step) => step * BASE_PIXELS_PER_MM * zoom >= 55,
  ) ?? 100;
}

function prepareRuler(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
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
  context.fillStyle = '#f3f6f8';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#b9c6cf';
  context.fillStyle = '#526673';
  context.font = '10px "Segoe UI", sans-serif';
  return context;
}

function drawRulers(
  canvas: Canvas,
  topElement: HTMLCanvasElement | null,
  leftElement: HTMLCanvasElement | null,
  workArea: WorkAreaSettings,
): void {
  if (!topElement || !leftElement) return;
  const top = prepareRuler(topElement);
  const left = prepareRuler(leftElement);
  if (!top || !left) return;
  const zoom = canvas.getZoom();
  const viewport = canvas.viewportTransform;
  const majorMm = chooseRulerStep(zoom);
  const minorMm = majorMm / 5;
  const majorUm = majorMm * 1000;
  const minorUm = minorMm * 1000;
  const minX = workArea.center.xUm - workArea.widthUm / 2;
  const maxX = workArea.center.xUm + workArea.widthUm / 2;
  const minY = workArea.center.yUm - workArea.heightUm / 2;
  const maxY = workArea.center.yUm + workArea.heightUm / 2;

  top.beginPath(); top.moveTo(0, topElement.clientHeight - 0.5);
  top.lineTo(topElement.clientWidth, topElement.clientHeight - 0.5); top.stroke();
  for (let xUm = Math.ceil(minX / minorUm) * minorUm; xUm <= maxX; xUm += minorUm) {
    const x = worldToScene({ xUm, yUm: 0 }, workArea).x * zoom + viewport[4];
    if (x < 0 || x > topElement.clientWidth) continue;
    const major = Math.abs(xUm / majorUm - Math.round(xUm / majorUm)) < 1e-6;
    top.beginPath(); top.moveTo(x + 0.5, 28); top.lineTo(x + 0.5, major ? 12 : 20); top.stroke();
    if (major) top.fillText(`${xUm / 1000}`, x + 3, 10);
  }

  left.beginPath(); left.moveTo(leftElement.clientWidth - 0.5, 0);
  left.lineTo(leftElement.clientWidth - 0.5, leftElement.clientHeight); left.stroke();
  for (let yUm = Math.ceil(minY / minorUm) * minorUm; yUm <= maxY; yUm += minorUm) {
    const y = worldToScene({ xUm: 0, yUm }, workArea).y * zoom + viewport[5];
    if (y < 0 || y > leftElement.clientHeight) continue;
    const major = Math.abs(yUm / majorUm - Math.round(yUm / majorUm)) < 1e-6;
    left.beginPath(); left.moveTo(28, y + 0.5); left.lineTo(major ? 12 : 20, y + 0.5); left.stroke();
    if (major) {
      left.save(); left.translate(10, y - 3); left.rotate(-Math.PI / 2);
      left.fillText(`${yUm / 1000}`, 0, 0); left.restore();
    }
  }
}

export const CanvasSurface = forwardRef<CanvasSurfaceHandle>(function CanvasSurface(_, ref) {
  const elementRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const topRulerRef = useRef<HTMLCanvasElement>(null);
  const leftRulerRef = useRef<HTMLCanvasElement>(null);
  const registryRef = useRef(new Map<EntityId, FabricObject>());
  const suppressSelectionRef = useRef(false);
  const drawSessionRef = useRef<DrawSession | null>(null);
  const panSessionRef = useRef<PanSession | null>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const entities = useEditorStore((state) => state.document.entities);
  const grid = useEditorStore((state) => state.document.grid);
  const workArea = useEditorStore((state) => state.document.workArea);
  const selectionIds = useEditorStore((state) => state.selectionIds);
  const tool = useEditorStore((state) => state.tool);

  useImperativeHandle(ref, () => ({
    fitWorkArea: () => canvas && fitWorkArea(canvas, useEditorStore.getState().document.workArea),
  }), [canvas]);

  const refresh = useCallback((target: Canvas) => {
    rebuildCanvas(target, registryRef.current, suppressSelectionRef);
  }, []);

  useEffect(() => {
    if (!elementRef.current || !hostRef.current) return;
    const instance = new Canvas(elementRef.current, {
      selection: true,
      targetFindTolerance: 4,
      preserveObjectStacking: true,
      stopContextMenu: true,
      fireRightClick: true,
      uniformScaling: false,
      uniScaleKey: 'shiftKey',
    });
    setCanvas(instance);

    const renderRulers = () => drawRulers(
      instance, topRulerRef.current, leftRulerRef.current,
      useEditorStore.getState().document.workArea,
    );
    const synchronizeScreenStrokes = () => {
      updateScreenStrokeWidths(
        instance.getObjects(),
        instance.getZoom(),
      );
    };
    instance.on('before:render', synchronizeScreenStrokes);
    instance.on('after:render', renderRulers);

    const resize = () => {
      if (!hostRef.current) return;
      instance.setDimensions({
        width: Math.max(320, hostRef.current.clientWidth),
        height: Math.max(320, hostRef.current.clientHeight),
      });
      fitWorkArea(instance, useEditorStore.getState().document.workArea);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);
    resize();

    const syncSelection = (target: FabricObject | undefined) => {
      if (!suppressSelectionRef.current) useEditorStore.getState().setSelection(selectedIds(target));
    };
    instance.on('selection:created', () => syncSelection(instance.getActiveObject()));
    instance.on('selection:updated', () => syncSelection(instance.getActiveObject()));
    instance.on('selection:cleared', () => syncSelection(undefined));

    const currentObjects = (target: FabricObject | undefined): FabricObject[] => (
      target instanceof ActiveSelection ? target.getObjects() : target ? [target] : []
    );
    const projectObjects = (
      target: FabricObject | undefined,
      transient: boolean,
      options: ProjectionOptions = {},
    ): boolean => {
      const state = useEditorStore.getState();
      const byId = new Map(state.document.entities.map((entity) => [entity.id, entity]));
      const updates: EditableEntity[] = [];
      for (const object of currentObjects(target)) {
        const id = getEntityId(object);
        const entity = id ? byId.get(id) : undefined;
        if (!entity) continue;
        const update = fabricObjectToEntity(
          object,
          entity,
          state.document.grid,
          state.document.workArea,
          options,
        );
        if (!update) return false;
        updates.push(update);
      }
      if (updates.length) {
        if (transient) state.setTransientEntities(updates);
        else state.replaceEntities(updates);
      }
      return true;
    };

    instance.on('object:moving', (event) => {
      const state = useEditorStore.getState();
      if (event.target && state.document.grid.snapMove) {
        const center = event.target.getCenterPoint();
        const snapped = worldToScene(
          snapObjectCenterForMove(
            event.target,
            sceneToWorld(center, state.document.workArea),
            state.document.grid.spacingUm,
            state.document.workArea,
          ),
          state.document.workArea,
        );
        event.target.set({
          left: (event.target.left ?? 0) + snapped.x - center.x,
          top: (event.target.top ?? 0) + snapped.y - center.y,
        });
        event.target.setCoords();
      }
      projectObjects(event.target, true, { snapMove: false, snapResize: false });
    });

    instance.on('object:scaling', (event) => {
      const state = useEditorStore.getState();
      projectObjects(event.target, true, {
        snapMove: false,
        snapResize: state.document.grid.snapResize,
        resizeCorner: event.transform?.corner,
      });
    });
    instance.on('object:rotating', (event) => projectObjects(
      event.target,
      true,
      { snapMove: false, snapResize: false },
    ));
    instance.on('object:modifyPoly', (event) => projectObjects(event.target, true));

    instance.on('object:modified', (event) => {
      const state = useEditorStore.getState();
      const action = event.transform?.action ?? '';
      const resizing = action.startsWith('scale');
      const options: ProjectionOptions = resizing
        ? {
            snapMove: false,
            snapResize: state.document.grid.snapResize,
            resizeCorner: event.transform?.corner,
          }
        : {
            snapMove: action === 'modifyPoly' && state.document.grid.snapMove,
            snapResize: false,
          };
      if (!projectObjects(event.target, false, options)) {
        state.clearTransientEntities();
        state.setStatus('error.geometryOutOfBounds');
        refresh(instance);
      }
    });

    instance.on('mouse:down', (event) => {
      const mouse = event.e as MouseEvent;
      const state = useEditorStore.getState();
      if (mouse.button === 1 || state.tool === 'pan') {
        panSessionRef.current = { x: mouse.clientX, y: mouse.clientY };
        instance.defaultCursor = 'grabbing';
        return;
      }
      if (mouse.button !== 0 || (state.tool !== 'rectangle' && state.tool !== 'line')) return;
      const start = pointerWorld(event.scenePoint, state.document.grid.snapMove);
      const preview = createPreview(
        state.tool,
        start,
        state.document.workArea,
        instance.getZoom(),
      );
      drawSessionRef.current = { tool: state.tool, start, preview };
      instance.add(preview);
      instance.requestRenderAll();
    });

    instance.on('mouse:move', (event) => {
      const mouse = event.e as MouseEvent;
      if (panSessionRef.current) {
        const viewport = instance.viewportTransform;
        viewport[4] += mouse.clientX - panSessionRef.current.x;
        viewport[5] += mouse.clientY - panSessionRef.current.y;
        panSessionRef.current = { x: mouse.clientX, y: mouse.clientY };
        instance.setViewportTransform(viewport);
        instance.requestRenderAll();
        return;
      }
      const session = drawSessionRef.current;
      if (!session) return;
      const state = useEditorStore.getState();
      const raw = pointerWorld(event.scenePoint, state.document.grid.snapResize);
      const current = constrainDrawingEnd(session.tool, session.start, raw, mouse.shiftKey);
      updatePreview(session, current, state.document.workArea);
      instance.requestRenderAll();
    });

    instance.on('mouse:up', (event) => {
      if (panSessionRef.current) {
        panSessionRef.current = null;
        instance.defaultCursor = useEditorStore.getState().tool === 'pan' ? 'grab' : 'default';
      }
      const session = drawSessionRef.current;
      if (!session) return;
      const mouse = event.e as MouseEvent;
      const state = useEditorStore.getState();
      const raw = pointerWorld(event.scenePoint, state.document.grid.snapResize);
      const current = constrainDrawingEnd(session.tool, session.start, raw, mouse.shiftKey);
      instance.remove(session.preview);
      drawSessionRef.current = null;
      const sequence = state.document.entities.length + 1;
      const entity = session.tool === 'rectangle'
        ? rectangleFromDrag(
            session.start,
            current,
            sequence,
            state.document.workArea,
            state.document.defaultProcess,
          )
        : lineFromDrag(
            session.start,
            current,
            sequence,
            state.document.workArea,
            state.document.defaultProcess,
          );
      if (entity) {
        state.addEntity(entity);
        state.setTool('select');
      } else state.setStatus('error.geometryOutOfBounds');
    });

    instance.on('mouse:wheel', (event) => {
      const wheel = event.e as WheelEvent;
      const nextZoom = Math.max(0.1, Math.min(20, instance.getZoom() * 0.999 ** wheel.deltaY));
      instance.zoomToPoint(new Point(wheel.offsetX, wheel.offsetY), nextZoom);
      wheel.preventDefault(); wheel.stopPropagation();
    });

    return () => {
      observer.disconnect();
      instance.off('before:render', synchronizeScreenStrokes);
      instance.off('after:render', renderRulers);
      setCanvas(null);
      void instance.dispose();
    };
  }, [refresh]);

  useEffect(() => { if (canvas) refresh(canvas); }, [canvas, entities, grid, refresh]);

  useEffect(() => {
    if (!canvas) return;
    refresh(canvas);
    fitWorkArea(canvas, workArea);
  }, [canvas, workArea, refresh]);

  useEffect(() => {
    if (!canvas) return;
    // Fabric selects on pointer-down and starts its transform immediately. Reapplying
    // the same selection here would replace that active object and cancel the drag.
    if (sameSelection(selectedIds(canvas.getActiveObject()), selectionIds)) return;
    suppressSelectionRef.current = true;
    applySelection(canvas, registryRef.current, selectionIds);
    suppressSelectionRef.current = false;
  }, [canvas, selectionIds]);

  useEffect(() => {
    if (!canvas) return;
    const state = useEditorStore.getState();
    const selecting = tool === 'select';
    canvas.selection = selecting;
    configureGeometryInteraction(registryRef.current, state.document.entities, tool);
    canvas.defaultCursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
    if (selecting) {
      applySelection(canvas, registryRef.current, state.selectionIds);
    } else {
      suppressSelectionRef.current = true;
      canvas.discardActiveObject();
      suppressSelectionRef.current = false;
      state.setSelection([]);
    }
    canvas.requestRenderAll();
  }, [canvas, tool]);

  return (
    <div className="canvas-surface">
      <div className="ruler-corner">mm</div>
      <canvas className="ruler-top" ref={topRulerRef} />
      <canvas className="ruler-left" ref={leftRulerRef} />
      <div className="fabric-host" ref={hostRef}><canvas ref={elementRef} /></div>
    </div>
  );
});
