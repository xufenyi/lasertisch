import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { Path, Point, type FabricObject } from 'fabric';
import fixture from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { worldToScene } from '../domain/geometry';
import { polygonWorldPoint } from '../domain/polygonGeometry';
import type { EllipseEntity, PointUm, PolygonEntity } from '../domain/model';
import { getEntityId } from './fabricAdapter';
import { useEditorStore } from '../state/editorStore';
import { handlePolygonKey } from './polygonKeyboard';
import { CanvasSurface } from './CanvasSurface';
import { booleanDocument, booleanFixture } from '../test/booleanFixtures';

// The real component's event handlers run against a small rendering surface double.
// Native browser drawing and pointer capture remain part of the manual acceptance.
interface TestCanvas {
  fire: (name: string, event: unknown) => void;
  getActiveObject: () => FabricObject | undefined;
  getObjects: () => FabricObject[];
}
const drawing = vi.hoisted(() => ({ canvas: null as TestCanvas | null }));
vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  class Canvas {
    viewportTransform = [1,0,0,1,0,0];
    width = 800; height = 800; objects: FabricObject[] = [];
    active: FabricObject | undefined;
    listeners = new Map<string, ((event: unknown) => void)[]>();
    constructor() { drawing.canvas = this; }
    on(name: string, callback: (event: unknown) => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], callback]); }
    off(name: string) { this.listeners.delete(name); }
    fire(name: string, event: unknown) { this.listeners.get(name)?.forEach((callback) => callback(event)); }
    getWidth() { return this.width; } getHeight() { return this.height; }
    getZoom() { return this.viewportTransform[0]; }
    setDimensions(value: {width:number;height:number}) { this.width=value.width; this.height=value.height; }
    setViewportTransform(value: number[]) { this.viewportTransform=value; }
    requestRenderAll() { this.fire('before:render', {}); this.fire('after:render', {}); }
    getObjects() { return this.objects; }
    add(...objects: FabricObject[]) { this.objects.push(...objects); }
    remove(object: FabricObject) { this.objects = this.objects.filter((item) => item !== object); }
    clear() { this.objects=[]; this.active=undefined; }
    setActiveObject(object: FabricObject) { this.active=object; }
    discardActiveObject() { this.active=undefined; }
    getActiveObject() { return this.active; }
    setCursor() {}
    dispose() { return Promise.resolve(); }
  }
  return {...actual, Canvas};
});

describe('ellipse canvas interactions', () => {
  it.each([{xUm:40_000,yUm:30_000},{xUm:-40_000,yUm:30_000},{xUm:40_000,yUm:-30_000},{xUm:-40_000,yUm:-30_000}])('draws straight-edge previews and commits a rectangle-inscribed ellipse: %j', (end) => {
    act(() => store().setTool('ellipse'));
    fire('mouse:down',{xUm:0,yUm:0}); fire('mouse:move',end);
    const preview = drawing.canvas!.getObjects().find((object) => object instanceof Path && !getEntityId(object)) as Path;
    expect(preview.path).toHaveLength(65);
    expect(preview.path.every((command) => ['M','L','Z'].includes(command[0]))).toBe(true);
    fire('mouse:up',end);
    const result = store().document.entities.at(-1) as EllipseEntity;
    expect(result).toMatchObject({kind:'ellipse',widthUm:40_000,heightUm:30_000,sides:64,
      center:{xUm:end.xUm/2,yUm:end.yUm/2}});
    expect(result.process).toEqual(store().document.defaultProcess);
    expect(store().tool).toBe('select'); expect(store().undoStack).toHaveLength(1);
    act(() => store().undo()); expect(store().document.entities).toHaveLength(4);
  });
  it('uses Shift to draw a circle and applies grid snapping', () => {
    act(() => { store().updateGrid({snapMove:true,snapResize:true}); store().setTool('ellipse'); });
    fire('mouse:down',{xUm:1000,yUm:1000});
    fire('mouse:move',{xUm:12_345,yUm:16_345},{shiftKey:true});
    fire('mouse:up',{xUm:12_345,yUm:16_345},{shiftKey:true});
    expect(store().document.entities.at(-1)).toMatchObject({kind:'ellipse',widthUm:15_000,heightUm:15_000,
      center:{xUm:7500,yUm:7500},sides:64});
  });
  it('cancels an unfinished ellipse when changing tools without adding history', () => {
    act(() => store().setTool('ellipse'));
    fire('mouse:down',{xUm:0,yUm:0}); fire('mouse:move',{xUm:20_000,yUm:10_000});
    act(() => store().setTool('select'));
    fire('mouse:up',{xUm:20_000,yUm:10_000});
    expect(store().document.entities).toHaveLength(4); expect(store().undoStack).toHaveLength(0);
  });
  it('rejects a zero-size ellipse', () => {
    act(() => store().setTool('ellipse'));
    click({xUm:0,yUm:0});
    expect(store().document.entities).toHaveLength(4); expect(store().undoStack).toHaveLength(0);
    expect(store().status).toBe('error.invalidEllipse');
  });
});

describe('boolean canvas preview', () => {
  it('shows a noninteractive green result while retaining faded source geometry and restores it on cancel', () => {
    act(() => store().loadDocument(booleanDocument()));
    const p=booleanFixture('hole',store().documentRevision).preview;
    act(() => store().setSelection([p.operandAId,p.operandBId]));
    act(() => {expect(store().setBooleanPreview(p)).toBe(true);});
    const result=drawing.canvas!.getObjects().find((object) => getEntityId(object)===p.result!.id)!;
    expect(result.stroke).toBe('#2e7d32');expect(result.evented).toBe(false);expect(result.selectable).toBe(false);
    const source=drawing.canvas!.getObjects().find((object) => getEntityId(object)===p.operandAId)!;
    expect(source.opacity).toBe(.25);expect(source.evented).toBe(false);
    expect(drawing.canvas!.getActiveObject()).toBeUndefined();
    act(() => store().clearBooleanPreview());
    expect(drawing.canvas!.getObjects().some((object) => getEntityId(object)===p.result!.id)).toBe(false);
    const restored=drawing.canvas!.getObjects().find((object) => getEntityId(object)===p.operandAId)!;
    expect(restored.opacity).toBe(1);expect(restored.evented).toBe(true);
  });
});

const store = () => useEditorStore.getState();
const entity = () => store().document.entities[2] as PolygonEntity;
const point = (world: PointUm) => new Point(worldToScene(world, store().document.workArea));
function fire(name: string, world: PointUm, extra = {}) {
  act(() => drawing.canvas!.fire(name, { e: {button:0,clientX:0,clientY:0,shiftKey:false,...extra}, scenePoint:point(world) }));
}
function click(world: PointUm) { fire('mouse:down',world); fire('mouse:up',world); }
function startEditing() { act(() => store().startPolygonEdit(entity().id)); }

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D);
  store().loadDocument(parseProjectDocument(JSON.stringify(fixture)));
  render(<CanvasSurface />);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('polygon canvas interactions', () => {
  it('creates a polygon by clicking points and closing at its first point', () => {
    act(() => store().setTool('polygon'));
    click({xUm:0,yUm:0}); click({xUm:10_000,yUm:0}); click({xUm:0,yUm:10_000});
    expect(store().polygonDraft).toHaveLength(3); expect(store().undoStack).toHaveLength(0);
    click({xUm:0,yUm:0});
    expect(store().document.entities).toHaveLength(5); expect(store().undoStack).toHaveLength(1);
    expect(store().tool).toBe('select');
  });
  it('does not add clicks outside the work area or leave a draft after cancellation', () => {
    act(() => store().setTool('polygon'));
    click({xUm:100_000,yUm:0}); expect(store().polygonDraft).toHaveLength(0);
    click({xUm:0,yUm:0});
    act(() => { handlePolygonKey({key:'Escape',preventDefault(){}},'Polygon'); });
    expect(store().polygonDraft).toHaveLength(0); expect(store().document.entities).toHaveLength(4);
  });
  it('drags a rotated hole vertex with transient preview and one undo step', () => {
    startEditing(); expect(drawing.canvas!.getActiveObject()).toBeUndefined();
    const original = store().document;
    const start = polygonWorldPoint(entity(),entity().parts[0].holes[0][0]);
    const target = polygonWorldPoint(entity(),{xUm:-7000,yUm:-6000});
    fire('mouse:down',start); fire('mouse:move',target);
    expect(store().document).toBe(original);
    expect(store().transientEntities[entity().id]).toBeDefined();
    fire('mouse:up',target);
    expect(entity().parts[0].holes[0][0]).toEqual({xUm:-7000,yUm:-6000});
    expect(store().undoStack).toHaveLength(1); expect(store().transientEntities).toEqual({});
    act(() => store().undo()); expect(store().document).toEqual(original);
  });
  it('rejects dragging a hole outside its exterior and keeps the history unchanged', () => {
    startEditing(); const original = store().document;
    fire('mouse:down',polygonWorldPoint(entity(),entity().parts[0].holes[0][0]));
    const outside = polygonWorldPoint(entity(),{xUm:-30_000,yUm:-20_000});
    fire('mouse:move',outside); fire('mouse:up',outside);
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
    expect(store().status).toBe('error.invalidPolygon');
  });
  it('leaves a simple click unchanged and inserts a vertex by double-clicking an edge', () => {
    startEditing(); const original = store().document;
    click(polygonWorldPoint(entity(),entity().parts[0].holes[0][0]));
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
    fire('mouse:dblclick',polygonWorldPoint(entity(),{xUm:-9000,yUm:0}));
    expect(entity().parts[0].holes[0]).toHaveLength(5); expect(store().undoStack).toHaveLength(1);
  });
  it('cancels an in-progress drag on Escape without committing its preview', () => {
    startEditing(); const original = store().document;
    fire('mouse:down',polygonWorldPoint(entity(),entity().parts[0].holes[0][0]));
    const target = polygonWorldPoint(entity(),{xUm:-7000,yUm:-6000});
    fire('mouse:move',target);
    act(() => { handlePolygonKey({key:'Escape',preventDefault(){}},'Polygon'); });
    fire('mouse:up',target);
    expect(store().document).toBe(original); expect(store().transientEntities).toEqual({});
    expect(store().undoStack).toHaveLength(0);
  });
});
