import { create } from 'zustand';

import type { ApiIssue, ToolpathPlan } from '../domain/toolpath';

export type PlanningStatus = 'idle' | 'scheduled' | 'planning' | 'ready' | 'error' | 'unavailable';

interface PlanningState {
  previewVisible: boolean;
  status: PlanningStatus;
  plan: ToolpathPlan | null;
  planRevision: number | null;
  issues: ApiIssue[];
  setPreviewVisible: (visible: boolean) => void;
  setScheduled: () => void;
  setPending: () => void;
  setResult: (revision: number, plan: ToolpathPlan, issues: ApiIssue[]) => void;
  setFailure: (revision: number, issues: ApiIssue[], unavailable?: boolean) => void;
}

export const usePlanningStore = create<PlanningState>((set) => ({
  previewVisible: true,
  status: 'idle',
  plan: null,
  planRevision: null,
  issues: [],
  setPreviewVisible: (previewVisible) => set({
    previewVisible,
    status: previewVisible ? 'scheduled' : 'idle',
  }),
  setScheduled: () => set({ status: 'scheduled', issues: [] }),
  setPending: () => set({ status: 'planning', issues: [] }),
  setResult: (planRevision, plan, issues) => set({
    status: 'ready', planRevision, plan, issues,
  }),
  setFailure: (planRevision, issues, unavailable = false) => set({
    status: unavailable ? 'unavailable' : 'error',
    planRevision,
    plan: null,
    issues,
  }),
}));
