import { create } from 'zustand';

import { isEntityInWorkArea } from '../domain/geometry';
import { isValidPolygon } from '../domain/polygonGeometry';
import { ellipseToPolygon, isValidEllipse } from '../domain/ellipseGeometry';
import type { BooleanPreview } from '../domain/boolean';
import {
  deletePolygonVertex, insertPolygonVertex, movePolygonVertex, polygonFromPoints, polygonRing,
  reconcilePolygonEdit, type PolygonEditState, type PolygonVertexAddress,
} from '../domain/polygonEditing';
import {
  createEmptyDocument,
  createEntityId,
  type EditableEntity,
  type EditorDocument,
  type EntityId,
  type GridSettings,
  type GlobalSettings,
  type ProcessSpec,
  type PointUm,
  type PolygonEntity,
  type TextEntity,
  type Tool,
  type WorkAreaSettings,
  WORK_AREA_SIZE_UM,
} from '../domain/model';

const HISTORY_LIMIT = 100;
export interface TextSession { id: string; entityId: string | null; position: PointUm; revision: number }

interface EditorState {
  document: EditorDocument;
  documentRevision: number;
  selectionIds: EntityId[];
  transientEntities: Record<EntityId, EditableEntity>;
  polygonDraft: PointUm[];
  polygonEdit: PolygonEditState | null;
  booleanPreview: BooleanPreview | null;
  textSession: TextSession | null;
  textPreview: TextEntity | null;
  beginText: (position: PointUm, entityId?: string) => void;
  cancelText: () => void;
  setTextPreview: (entity: TextEntity | null, sessionId: string) => boolean;
  applyTextPreview: (sessionId: string) => boolean;
  convertTextToPolygon: (id: EntityId) => void;
  tool: Tool;
  status: string | null;
  undoStack: EditorDocument[];
  redoStack: EditorDocument[];
  savedFingerprint: string;
  isDirty: boolean;
  addEntity: (entity: EditableEntity) => void;
  replaceEntities: (entities: EditableEntity[]) => void;
  renameEntity: (id: EntityId, name: string) => boolean;
  setTransientEntities: (entities: EditableEntity[]) => void;
  clearTransientEntities: () => void;
  deleteSelected: () => void;
  setSelection: (ids: EntityId[]) => void;
  setTool: (tool: Tool) => void;
  appendPolygonPoint: (point: PointUm) => boolean;
  undoPolygonPoint: () => void;
  finishPolygon: (name?: string) => boolean;
  startPolygonEdit: (id: EntityId) => void;
  finishPolygonEdit: () => void;
  convertEllipseToPolygon: (id: EntityId) => boolean;
  setBooleanPreview: (preview: BooleanPreview) => boolean;
  clearBooleanPreview: () => void;
  applyBooleanPreview: (requestId: string, keepOriginals: boolean, allowEmpty: boolean, name: string) => boolean;
  selectPolygonVertex: (vertex: PolygonVertexAddress) => void;
  moveSelectedVertex: (point: PointUm) => boolean;
  insertSelectedVertex: (point?: PointUm) => boolean;
  deleteSelectedVertex: () => boolean;
  updateGrid: (patch: Partial<GridSettings>) => void;
  updateWorkArea: (workArea: WorkAreaSettings) => boolean;
  updateProjectName: (name: string) => boolean;
  updateSelectedProcess: (patch: Partial<ProcessSpec>) => boolean;
  updateDefaultProcess: (patch: Partial<ProcessSpec>) => boolean;
  updateGlobalSettings: (patch: Partial<GlobalSettings>) => boolean;
  moveProcessingOrder: (id: EntityId, direction: -1 | 1) => void;
  undo: () => void;
  redo: () => void;
  newProject: (projectName?: string) => void;
  loadDocument: (document: EditorDocument) => void;
  markSaved: () => void;
  setStatus: (status: string | null) => void;
}

function sameIds(first: EntityId[], second: EntityId[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function fingerprint(document: EditorDocument): string {
  return JSON.stringify(document);
}

function committedDocument(state: EditorState, document: EditorDocument) {
  if (fingerprint(document) === fingerprint(state.document)) return {};
  return {
    document,
    documentRevision: state.documentRevision + 1,
    undoStack: [...state.undoStack, state.document].slice(-HISTORY_LIMIT),
    redoStack: [],
    transientEntities: {},
    polygonEdit: reconcilePolygonEdit(state.polygonEdit, document.entities),
    booleanPreview: null,
    textSession: null, textPreview: null,
    isDirty: fingerprint(document) !== state.savedFingerprint,
    status: null,
  };
}

function editedPolygon(state: EditorState): PolygonEntity | null {
  const entity = state.document.entities.find((item) => item.id === state.polygonEdit?.entityId);
  return entity?.kind === 'polygon' && !entity.locked && entity.visible ? entity : null;
}

function commitPolygonEdit(state: EditorState, entity: PolygonEntity | null, vertex?: PolygonVertexAddress) {
  if (!entity || !state.polygonEdit || !isValidPolygon(entity) || !isEntityInWorkArea(entity, state.document.workArea)) {
    return { status: 'error.invalidPolygon' };
  }
  return {
    ...committedDocument(state, { ...state.document, entities: state.document.entities.map((item) => item.id === entity.id ? entity : item) }),
    polygonEdit: { entityId: entity.id, vertex: vertex ?? state.polygonEdit.vertex },
  };
}

function isValidProcess(process: ProcessSpec): boolean {
  return Number.isSafeInteger(process.markSpeedUmPerSec) && process.markSpeedUmPerSec > 0 &&
    Number.isSafeInteger(process.fillAngleTenthsDeg) &&
    process.fillAngleTenthsDeg >= 0 && process.fillAngleTenthsDeg < 3600 &&
    Number.isSafeInteger(process.hatchSpacingUm) && process.hatchSpacingUm > 0;
}

function closedGeometryError(entity: EditableEntity, workArea: WorkAreaSettings): string | null {
  if (entity.kind === 'ellipse') {
    return isValidEllipse(entity) && isEntityInWorkArea(entity, workArea) ? null : 'error.invalidEllipse';
  }
  if (entity.kind === 'polygon' || entity.kind === 'text') {
    return isValidPolygon(entity) && isEntityInWorkArea(entity, workArea) ? null : 'error.invalidPolygon';
  }
  return null;
}

function booleanOperands(state: EditorState, preview: BooleanPreview) {
  const a = state.document.entities.find((entity) => entity.id === preview.operandAId);
  const b = state.document.entities.find((entity) => entity.id === preview.operandBId);
  if (state.documentRevision !== preview.documentRevision || state.tool !== 'select' || state.polygonEdit ||
    Object.keys(state.transientEntities).length || state.selectionIds.length !== 2 ||
    !state.selectionIds.includes(preview.operandAId) || !state.selectionIds.includes(preview.operandBId) ||
    preview.operandAId === preview.operandBId || !a || !b || a.kind === 'line' || b.kind === 'line' ||
    a.locked || b.locked || !a.visible || !b.visible) return null;
  return { a, b };
}

export function isValidEntityName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && !/[<>:"/\\|?*\u0000-\u001f]/.test(name);
}

export const useEditorStore = create<EditorState>((set) => {
  const initialDocument = createEmptyDocument();
  return {
    document: initialDocument,
    documentRevision: 0,
    selectionIds: [],
    transientEntities: {},
    polygonDraft: [],
    polygonEdit: null,
    booleanPreview: null,
    textSession: null, textPreview: null,
    tool: 'select',
    status: null,
    undoStack: [],
    redoStack: [],
    savedFingerprint: fingerprint(initialDocument),
    isDirty: false,

    beginText: (position, entityId) => set((state) => {
      const entity=entityId ? state.document.entities.find(e=>e.id===entityId) : null;
      if(entityId && (entity?.kind!=='text' || entity.locked || !entity.visible)) return {};
      return {textSession:{id:createEntityId(),entityId:entityId ?? null,position:{...position},revision:state.documentRevision},
        textPreview:null,tool:'select',selectionIds:entityId ? [entityId] : [],booleanPreview:null,polygonEdit:null,polygonDraft:[],transientEntities:{},status:null};
    }),
    cancelText: () => set({textSession:null,textPreview:null}),
    setTextPreview: (entity,sessionId) => {
      let accepted=false;
      set(state=>{
        if(state.textSession?.id!==sessionId || state.textSession.revision!==state.documentRevision) return {};
        if(entity && (closedGeometryError(entity,state.document.workArea) ||
          (state.textSession.entityId ? entity.id!==state.textSession.entityId : state.document.entities.some(e=>e.id===entity.id)))) return {};
        accepted=true; return {textPreview:entity};
      });return accepted;
    },
    applyTextPreview: (sessionId) => {
      let accepted=false;
      set(state=>{
        const session=state.textSession, candidate=state.textPreview;
        if(!session || session.id!==sessionId || session.revision!==state.documentRevision || !candidate || closedGeometryError(candidate,state.document.workArea)) return {};
        const previous=state.document.entities.find(e=>e.id===session.entityId);
        if(session.entityId && (previous?.kind!=='text' || previous.locked || !previous.visible)) return {};
        const entity=previous ? {...candidate,name:previous.name,process:{...previous.process}} : candidate;
        accepted=true;
        return {...committedDocument(state,{...state.document,
          entities:previous ? state.document.entities.map(e=>e.id===entity.id ? entity : e) : [...state.document.entities,entity],
          processingOrder:previous ? state.document.processingOrder : [...state.document.processingOrder,entity.id]}),
          selectionIds:[entity.id],textSession:null,textPreview:null};
      });return accepted;
    },
    convertTextToPolygon: (id) => set(state=>{
      const entity=state.document.entities.find(e=>e.id===id);
      if(entity?.kind!=='text' || entity.locked || !entity.visible) return {};
      const polygon: PolygonEntity={id:entity.id,name:entity.name,kind:'polygon',visible:entity.visible,locked:entity.locked,
        process:{...entity.process},position:{...entity.position},rotationTenthsDeg:entity.rotationTenthsDeg,parts:structuredClone(entity.parts)};
      return committedDocument(state,{...state.document,entities:state.document.entities.map(e=>e.id===id ? polygon : e)});
    }),

    addEntity: (entity) => set((state) => {
      const error = closedGeometryError(entity, state.document.workArea);
      if (error) return { status: error };
      return {
        ...committedDocument(state, {
          ...state.document,
          entities: [...state.document.entities, entity],
          processingOrder: [...state.document.processingOrder, entity.id],
        }),
        selectionIds: [entity.id],
      };
    }),

    replaceEntities: (entities) => {
      const replacements = new Map(entities.map((entity) => [entity.id, entity]));
      set((state) => {
        const error = entities.map((entity) => closedGeometryError(entity, state.document.workArea)).find(Boolean);
        if (error) return { status: error, transientEntities: {} };
        return committedDocument(state, {
          ...state.document,
          entities: state.document.entities.map((entity) => replacements.get(entity.id) ?? entity),
        });
      });
    },

    renameEntity: (id, rawName) => {
      const name = rawName.trim();
      if (!isValidEntityName(name)) {
        set({ status: 'error.invalidName' });
        return false;
      }
      set((state) => committedDocument(state, {
        ...state.document,
        entities: state.document.entities.map((entity) => entity.id === id ? { ...entity, name } : entity),
      }));
      return true;
    },

    setTransientEntities: (entities) => set({
      transientEntities: Object.fromEntries(entities.map((entity) => [entity.id, entity])),
      booleanPreview: null,
    }),
    clearTransientEntities: () => set({ transientEntities: {} }),

    deleteSelected: () => set((state) => {
      if (state.polygonEdit || state.tool === 'polygon' || state.textSession) return {};
      if (!state.selectionIds.length) return {};
      const deleted = new Set(state.selectionIds);
      return {
        ...committedDocument(state, {
          ...state.document,
          entities: state.document.entities.filter((entity) => !deleted.has(entity.id)),
          processingOrder: state.document.processingOrder.filter((id) => !deleted.has(id)),
        }),
        selectionIds: [],
      };
    }),

    setSelection: (ids) => set((state) => sameIds(state.selectionIds, ids)
      ? state
      : { selectionIds: ids, transientEntities: {}, booleanPreview: null, polygonEdit: ids.length === 1 && ids[0] === state.polygonEdit?.entityId ? state.polygonEdit : null }),
    setTool: (tool) => set({ tool, status: null, polygonDraft: [], polygonEdit: null, booleanPreview: null, transientEntities: {}, textSession:null,textPreview:null }),

    appendPolygonPoint: (point) => {
      let accepted = false;
      set((state) => {
        if (state.tool !== 'polygon') return {};
        const previous = state.polygonDraft.at(-1);
        if (!Number.isSafeInteger(point.xUm) || !Number.isSafeInteger(point.yUm) ||
          (previous?.xUm === point.xUm && previous?.yUm === point.yUm)) return { status: 'polygon.duplicateVertex' };
        const area = state.document.workArea;
        if (Math.abs(point.xUm - area.center.xUm) > area.widthUm / 2 || Math.abs(point.yUm - area.center.yUm) > area.heightUm / 2) return { status: 'error.geometryOutOfBounds' };
        accepted = true;
        return { polygonDraft: [...state.polygonDraft, point], status: null };
      });
      return accepted;
    },
    undoPolygonPoint: () => set((state) => ({ polygonDraft: state.polygonDraft.slice(0, -1), status: null })),
    finishPolygon: (name = 'Polygon') => {
      let accepted = false;
      set((state) => {
        if (state.tool !== 'polygon') return {};
        if (state.polygonDraft.length < 3) return { status: 'polygon.needThreeVertices' };
        const entity = polygonFromPoints(state.polygonDraft, state.document.defaultProcess,
          `${name} ${state.document.entities.length + 1}`, state.document.workArea);
        if (!entity) return { status: 'error.invalidPolygon' };
        accepted = true;
        return { ...committedDocument(state, { ...state.document, entities: [...state.document.entities, entity], processingOrder: [...state.document.processingOrder, entity.id] }),
          selectionIds: [entity.id], tool: 'select' as const, polygonDraft: [], polygonEdit: null };
      });
      return accepted;
    },
    startPolygonEdit: (id) => set((state) => {
      const entity = state.document.entities.find((item) => item.id === id);
      if (entity?.kind !== 'polygon' || entity.locked || !entity.visible) return {};
      return { tool: 'select', selectionIds: [id], polygonDraft: [], transientEntities: {}, booleanPreview: null, status: null,
        polygonEdit: { entityId: id, vertex: { partIndex: 0, ringIndex: 0, vertexIndex: 0 } } };
    }),
    finishPolygonEdit: () => set({ polygonEdit: null, transientEntities: {}, status: null }),
    setBooleanPreview: (preview) => {
      let accepted = false;
      set((state) => {
        if (!booleanOperands(state, preview) || preview.empty !== (preview.result === null)) return {};
        if (preview.result && (closedGeometryError(preview.result, state.document.workArea) ||
          state.document.entities.some((entity) => entity.id === preview.result!.id))) return {};
        accepted = true;
        return { booleanPreview: preview, status: null };
      });
      return accepted;
    },
    clearBooleanPreview: () => set({ booleanPreview: null }),
    applyBooleanPreview: (requestId, keepOriginals, allowEmpty, name) => {
      let accepted = false;
      set((state) => {
        const preview = state.booleanPreview;
        const operands = preview && booleanOperands(state, preview);
        if (!preview || preview.requestId !== requestId || !operands) return { booleanPreview: null, status: 'boolean.stale' };
        if (preview.empty && (keepOriginals || !allowEmpty)) return { status: 'boolean.emptyNeedsConfirmation' };
        const result = preview.result ? { ...preview.result, name, process: { ...operands.a.process }, visible: true, locked: false } : null;
        if (result && (!isValidEntityName(name) || closedGeometryError(result, state.document.workArea) ||
          state.document.entities.some((entity) => entity.id === result.id))) return { status: 'error.invalidPolygon' };
        const entities = state.document.entities.flatMap((entity) => {
          if (entity.id === preview.operandAId) return keepOriginals ? [entity, ...(result ? [result] : [])] : result ? [result] : [];
          return entity.id === preview.operandBId && !keepOriginals ? [] : [entity];
        });
        const processingOrder = state.document.processingOrder.flatMap((id) => {
          if (id === preview.operandAId) return keepOriginals ? [id, ...(result ? [result.id] : [])] : result ? [result.id] : [];
          return id === preview.operandBId && !keepOriginals ? [] : [id];
        });
        accepted = true;
        return { ...committedDocument(state, { ...state.document, entities, processingOrder }),
          selectionIds: result ? [result.id] : [], booleanPreview: null, polygonEdit: null, transientEntities: {} };
      });
      return accepted;
    },
    convertEllipseToPolygon: (id) => {
      let accepted = false;
      set((state) => {
        const entity = state.document.entities.find((item) => item.id === id);
        if (entity?.kind !== 'ellipse' || entity.locked || !entity.visible) return {};
        const polygon = ellipseToPolygon(entity);
        if (!isValidPolygon(polygon) || !isEntityInWorkArea(polygon, state.document.workArea)) return { status: 'error.invalidEllipse' };
        accepted = true;
        return { ...committedDocument(state, { ...state.document,
          entities: state.document.entities.map((item) => item.id === id ? polygon : item) }),
          selectionIds: [id], transientEntities: {}, polygonEdit: null };
      });
      return accepted;
    },
    selectPolygonVertex: (vertex) => set((state) => {
      const entity = editedPolygon(state);
      return entity && polygonRing(entity, vertex) ? { polygonEdit: { entityId: entity.id, vertex }, status: null } : {};
    }),
    moveSelectedVertex: (point) => {
      let accepted = false;
      set((state) => {
        const entity = editedPolygon(state);
        if (!entity || !state.polygonEdit) return {};
        const result = commitPolygonEdit(state, movePolygonVertex(entity, state.polygonEdit.vertex, point));
        accepted = result.status !== 'error.invalidPolygon';
        return result;
      });
      return accepted;
    },
    insertSelectedVertex: (point) => {
      let accepted = false;
      set((state) => {
        const entity = editedPolygon(state);
        if (!entity || !state.polygonEdit) return {};
        const address = state.polygonEdit.vertex;
        const result = commitPolygonEdit(state, insertPolygonVertex(entity, address, point), { ...address, vertexIndex: address.vertexIndex + 1 });
        accepted = result.status !== 'error.invalidPolygon';
        return result;
      });
      return accepted;
    },
    deleteSelectedVertex: () => {
      let accepted = false;
      set((state) => {
        const entity = editedPolygon(state);
        if (!entity || !state.polygonEdit) return {};
        const address = state.polygonEdit.vertex, ring = polygonRing(entity, address);
        if (!ring || ring.length <= 3) return { status: 'polygon.minimumVertices' };
        const result = commitPolygonEdit(state, deletePolygonVertex(entity, address), { ...address, vertexIndex: Math.min(address.vertexIndex, ring.length - 2) });
        accepted = result.status !== 'error.invalidPolygon';
        return result;
      });
      return accepted;
    },

    updateGrid: (patch) => set((state) => committedDocument(state, {
      ...state.document,
      grid: { ...state.document.grid, ...patch },
    })),

    updateWorkArea: (workArea) => {
      if (
        workArea.widthUm <= 0 || workArea.heightUm <= 0 ||
        workArea.widthUm > WORK_AREA_SIZE_UM || workArea.heightUm > WORK_AREA_SIZE_UM
      ) {
        set({ status: 'error.invalidValue' });
        return false;
      }
      let accepted = false;
      set((state) => {
        if (!state.document.entities.every((entity) => isEntityInWorkArea(entity, workArea))) {
          return { status: 'error.geometryOutOfBounds' };
        }
        accepted = true;
        return committedDocument(state, { ...state.document, workArea });
      });
      return accepted;
    },

    updateProjectName: (rawName) => {
      const projectName = rawName.trim();
      if (!projectName || projectName.length > 200) {
        set({ status: 'error.invalidName' });
        return false;
      }
      set((state) => committedDocument(state, { ...state.document, projectName }));
      return true;
    },

    updateSelectedProcess: (patch) => {
      let accepted = false;
      set((state) => {
        const selected = new Set(state.selectionIds);
        if (!selected.size) return {};
        const entities = state.document.entities.map((entity) => {
          if (!selected.has(entity.id)) return entity;
          const process = { ...entity.process, ...patch };
          if (
            !isValidProcess(process) ||
            (entity.kind === 'line' && process.mode !== 'none' && process.mode !== 'contour')
          ) return entity;
          return { ...entity, process } as EditableEntity;
        });
        if (entities.some((entity, index) => selected.has(entity.id) && entity === state.document.entities[index])) {
          return { status: 'error.invalidValue' };
        }
        accepted = true;
        return committedDocument(state, { ...state.document, entities });
      });
      return accepted;
    },

    updateDefaultProcess: (patch) => {
      let accepted = false;
      set((state) => {
        const defaultProcess = { ...state.document.defaultProcess, ...patch };
        if (!isValidProcess(defaultProcess)) return { status: 'error.invalidValue' };
        accepted = true;
        return committedDocument(state, { ...state.document, defaultProcess });
      });
      return accepted;
    },

    updateGlobalSettings: (patch) => {
      let accepted = false;
      set((state) => {
        const globalSettings = { ...state.document.globalSettings, ...patch };
        if (
          !Number.isSafeInteger(globalSettings.travelSpeedUmPerSec) ||
          globalSettings.travelSpeedUmPerSec <= 0 ||
          globalSettings.minimumMarkSegmentUm !== 100 ||
          globalSettings.initialJumpToOrigin !== true
        ) return { status: 'error.invalidValue' };
        accepted = true;
        return committedDocument(state, { ...state.document, globalSettings });
      });
      return accepted;
    },

    moveProcessingOrder: (id, direction) => set((state) => {
      const index = state.document.processingOrder.indexOf(id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= state.document.processingOrder.length) return {};
      const processingOrder = [...state.document.processingOrder];
      [processingOrder[index], processingOrder[destination]] = [processingOrder[destination], processingOrder[index]];
      return committedDocument(state, { ...state.document, processingOrder });
    }),

    undo: () => set((state) => {
      if (state.tool === 'polygon') return { polygonDraft: state.polygonDraft.slice(0, -1), status: null };
      const document = state.undoStack.at(-1);
      if (!document) return {};
      return {
        document,
        documentRevision: state.documentRevision + 1,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [state.document, ...state.redoStack].slice(0, HISTORY_LIMIT),
        selectionIds: state.selectionIds.filter((id) => document.entities.some((entity) => entity.id === id)),
        transientEntities: {},
        polygonEdit: reconcilePolygonEdit(state.polygonEdit, document.entities),
        booleanPreview: null, textSession:null, textPreview:null,
        isDirty: fingerprint(document) !== state.savedFingerprint,
        status: null,
      };
    }),

    redo: () => set((state) => {
      if (state.tool === 'polygon') return {};
      const [document, ...rest] = state.redoStack;
      if (!document) return {};
      return {
        document,
        documentRevision: state.documentRevision + 1,
        undoStack: [...state.undoStack, state.document].slice(-HISTORY_LIMIT),
        redoStack: rest,
        selectionIds: state.selectionIds.filter((id) => document.entities.some((entity) => entity.id === id)),
        transientEntities: {},
        polygonEdit: reconcilePolygonEdit(state.polygonEdit, document.entities),
        booleanPreview: null, textSession:null, textPreview:null,
        isDirty: fingerprint(document) !== state.savedFingerprint,
        status: null,
      };
    }),

    newProject: (projectName = 'Untitled project') => set((state) => {
      const document = createEmptyDocument(projectName);
      return {
        document,
        documentRevision: state.documentRevision + 1,
        selectionIds: [],
        transientEntities: {},
        polygonDraft: [], polygonEdit: null,
        booleanPreview: null, textSession:null, textPreview:null,
        tool: 'select',
        undoStack: [],
        redoStack: [],
        savedFingerprint: fingerprint(document),
        isDirty: false,
        status: null,
      };
    }),

    loadDocument: (document) => set((state) => ({
      document,
      documentRevision: state.documentRevision + 1,
      selectionIds: [],
      transientEntities: {},
      polygonDraft: [], polygonEdit: null,
      booleanPreview: null, textSession:null, textPreview:null,
      tool: 'select',
      undoStack: [],
      redoStack: [],
      savedFingerprint: fingerprint(document),
      isDirty: false,
      status: null,
    })),

    markSaved: () => set((state) => ({
      savedFingerprint: fingerprint(state.document),
      isDirty: false,
      status: null,
    })),
    setStatus: (status) => set({ status }),
  };
});
