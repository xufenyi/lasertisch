import { useEffect, useRef } from 'react';
import { Alert, Box, CssBaseline, ThemeProvider, Typography, createTheme } from '@mui/material';
import { useTranslation } from 'react-i18next';

import { EditorToolbar } from './components/EditorToolbar';
import { PropertiesPanel } from './components/PropertiesPanel';
import { CanvasSurface, type CanvasSurfaceHandle } from './editor/CanvasSurface';
import { isFitWorkAreaShortcut, toolForShortcut } from './editor/toolShortcuts';
import { useEditorStore } from './state/editorStore';
import './styles.css';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1666a7' },
    background: { default: '#e8eef3', paper: '#ffffff' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily:
      'Inter, "Segoe UI", "Microsoft YaHei UI", "Noto Sans CJK KR", sans-serif',
    fontSize: 13,
  },
});

export default function App() {
  const { t } = useTranslation();
  const canvasRef = useRef<CanvasSurfaceHandle>(null);
  const status = useEditorStore((state) => state.status);
  const objectCount = useEditorStore((state) => state.document.entities.length);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const setSelection = useEditorStore((state) => state.setSelection);
  const setTool = useEditorStore((state) => state.setTool);
  const setStatus = useEditorStore((state) => state.setStatus);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const isDirty = useEditorStore((state) => state.isDirty);
  const projectName = useEditorStore((state) => state.document.projectName);

  useEffect(() => {
    window.document.title = `${isDirty ? '* ' : ''}${projectName} — LaserTisch`;
  }, [isDirty, projectName]);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!status) return;
    const timeout = window.setTimeout(() => setStatus(null), 3_500);
    return () => window.clearTimeout(timeout);
  }, [setStatus, status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        Boolean(target?.closest('[role="listbox"], [role="menu"]'));
      if (editing) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (modifier && !event.altKey && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === 'Escape') {
        setSelection([]);
        setTool('select');
      } else if (isFitWorkAreaShortcut(event.key, event.ctrlKey, event.metaKey, event.altKey)) {
        event.preventDefault();
        canvasRef.current?.fitWorkArea();
      } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
        const shortcutTool = toolForShortcut(event.key);
        if (shortcutTool) {
          event.preventDefault();
          setTool(shortcutTool);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, redo, setSelection, setTool, undo]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="app-shell">
        <EditorToolbar onFit={() => canvasRef.current?.fitWorkArea()} />
        <Box className="app-workspace">
          <Box className="canvas-column">
            {status && <Alert className="canvas-alert" severity="warning">{t(status)}</Alert>}
            <CanvasSurface ref={canvasRef} />
            <Box className="status-bar">
              <Typography variant="caption">
                {projectName}{isDirty ? ' *' : ''} · {t('status.ready')}
              </Typography>
              <Typography variant="caption">{t('status.objectCount', { count: objectCount })}</Typography>
            </Box>
          </Box>
          <PropertiesPanel />
        </Box>
      </Box>
    </ThemeProvider>
  );
}

