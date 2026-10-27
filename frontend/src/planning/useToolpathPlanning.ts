import { useEffect } from 'react';

import type { ApiIssue } from '../domain/toolpath';
import { useEditorStore } from '../state/editorStore';
import { PlanningUnavailableError, requestToolpathPlan } from './planningClient';
import { usePlanningStore } from './planningStore';

const DEBOUNCE_MS = 250;

export function useToolpathPlanning(): void {
  const document = useEditorStore((state) => state.document);
  const revision = useEditorStore((state) => state.documentRevision);
  const previewVisible = usePlanningStore((state) => state.previewVisible);

  useEffect(() => {
    if (!previewVisible) return;
    const planning = usePlanningStore.getState();
    planning.setScheduled();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      usePlanningStore.getState().setPending();
      void requestToolpathPlan(document, revision, controller.signal)
        .then((response) => {
          if (useEditorStore.getState().documentRevision !== revision) return;
          if (response.ok && response.plan) {
            usePlanningStore.getState().setResult(revision, response.plan, response.warnings);
          } else {
            usePlanningStore.getState().setFailure(revision, response.errors);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          if (useEditorStore.getState().documentRevision !== revision) return;
          const issue: ApiIssue = {
            code: error instanceof PlanningUnavailableError
              ? 'bridge.planningUnavailable'
              : 'bridge.invalidPlanningResponse',
            parameters: {},
          };
          usePlanningStore.getState().setFailure(
            revision,
            [issue],
            error instanceof PlanningUnavailableError,
          );
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [document, previewVisible, revision]);
}
