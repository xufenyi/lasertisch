import { useEditorStore } from '../state/editorStore';

/** Called after the application's text-input guard, before global object shortcuts. */
export function handlePolygonKey(event: Pick<KeyboardEvent, 'key' | 'preventDefault'>, polygonName: string): boolean {
  const state = useEditorStore.getState();
  if (state.tool === 'polygon') {
    if (event.key === 'Enter') state.finishPolygon(polygonName);
    else if (event.key === 'Escape') state.setTool('select');
    else if (event.key === 'Backspace') state.undoPolygonPoint();
    else if (event.key !== 'Delete') return false;
  } else if (state.polygonEdit) {
    if (event.key === 'Escape') state.finishPolygonEdit();
    else if (event.key === 'Delete' || event.key === 'Backspace') state.deleteSelectedVertex();
    else return false;
  } else return false;
  event.preventDefault();
  return true;
}
