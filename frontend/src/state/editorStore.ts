import { create } from 'zustand';
import {
  createEmptyDocument,
  type EditableEntity,
  type EditorDocument,
  type EntityId,
  type GridSettings,
  type Tool,
  type WorkAreaSettings,
  WORK_AREA_SIZE_UM,
} from '../domain/model';
import { isEntityInWorkArea } from '../domain/geometry';

interface EditorState {
  document: EditorDocument;
  selectionIds: EntityId[];
  transientEntities: Record<EntityId, EditableEntity>;
  tool: Tool;
  status: string | null;
  addEntity: (entity: EditableEntity) => void;
  replaceEntities: (entities: EditableEntity[]) => void;
  renameEntity: (id: EntityId, name: string) => boolean;
  setTransientEntities: (entities: EditableEntity[]) => void;
  clearTransientEntities: () => void;
  deleteSelected: () => void;
  setSelection: (ids: EntityId[]) => void;
  setTool: (tool: Tool) => void;
  updateGrid: (patch: Partial<GridSettings>) => void;
  updateWorkArea: (workArea: WorkAreaSettings) => boolean;
  setStatus: (status: string | null) => void;
}

function sameIds(first: EntityId[], second: EntityId[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

export function isValidEntityName(name: string): boolean {
  return name.length > 0 && name.length <= 200 && !/[<>:"/\\|?*\u0000-\u001f]/.test(name);
}

export const useEditorStore = create<EditorState>((set) => ({
  document: createEmptyDocument(),
  selectionIds: [],
  transientEntities: {},
  tool: 'select',
  status: null,
  addEntity: (entity) =>
    set((state) => ({
      document: {
        ...state.document,
        entities: [...state.document.entities, entity],
        processingOrder: [...state.document.processingOrder, entity.id],
      },
      selectionIds: [entity.id],
      transientEntities: {},
      status: null,
    })),
  replaceEntities: (entities) => {
    const replacements = new Map(entities.map((entity) => [entity.id, entity]));
    set((state) => ({
      document: {
        ...state.document,
        entities: state.document.entities.map(
          (entity) => replacements.get(entity.id) ?? entity,
        ),
      },
      transientEntities: {},
      status: null,
    }));
  },
  renameEntity: (id, rawName) => {
    const name = rawName.trim();
    if (!isValidEntityName(name)) {
      set({ status: 'error.invalidName' });
      return false;
    }
    set((state) => ({
      document: {
        ...state.document,
        entities: state.document.entities.map((entity) => (
          entity.id === id ? { ...entity, name } : entity
        )),
      },
      status: null,
    }));
    return true;
  },
  setTransientEntities: (entities) =>
    set({ transientEntities: Object.fromEntries(entities.map((entity) => [entity.id, entity])) }),
  clearTransientEntities: () => set({ transientEntities: {} }),
  deleteSelected: () =>
    set((state) => {
      const deleted = new Set(state.selectionIds);
      return {
        document: {
          ...state.document,
          entities: state.document.entities.filter((entity) => !deleted.has(entity.id)),
          processingOrder: state.document.processingOrder.filter((id) => !deleted.has(id)),
        },
        selectionIds: [],
        transientEntities: {},
        status: null,
      };
    }),
  setSelection: (ids) =>
    set((state) => (
      sameIds(state.selectionIds, ids)
        ? state
        : { selectionIds: ids, transientEntities: {} }
    )),
  setTool: (tool) => set({ tool, status: null }),
  updateGrid: (patch) =>
    set((state) => ({
      document: {
        ...state.document,
        grid: { ...state.document.grid, ...patch },
      },
    })),
  updateWorkArea: (workArea) => {
    if (
      workArea.widthUm <= 0 ||
      workArea.heightUm <= 0 ||
      workArea.widthUm > WORK_AREA_SIZE_UM ||
      workArea.heightUm > WORK_AREA_SIZE_UM
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
      return {
        document: { ...state.document, workArea },
        transientEntities: {},
        status: null,
      };
    });
    return accepted;
  },
  setStatus: (status) => set({ status }),
}));

