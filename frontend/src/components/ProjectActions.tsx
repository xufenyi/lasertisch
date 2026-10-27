import { useCallback, useEffect, useRef } from 'react';
import {
  Divider,
  IconButton,
  Stack,
  Tooltip,
} from '@mui/material';
import CreateNewFolderRoundedIcon from '@mui/icons-material/CreateNewFolderRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RedoRoundedIcon from '@mui/icons-material/RedoRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { useTranslation } from 'react-i18next';

import {
  parseProjectDocument,
  projectFilename,
  serializeProjectDocument,
} from '../domain/projectFiles';
import { parseNativeOpenResult, parseNativeSaveResult } from '../desktop/desktopBridge';
import { useEditorStore } from '../state/editorStore';

export function ProjectActions() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const document = useEditorStore((state) => state.document);
  const isDirty = useEditorStore((state) => state.isDirty);
  const canUndo = useEditorStore((state) => state.undoStack.length > 0);
  const canRedo = useEditorStore((state) => state.redoStack.length > 0);
  const newProject = useEditorStore((state) => state.newProject);
  const loadDocument = useEditorStore((state) => state.loadDocument);
  const markSaved = useEditorStore((state) => state.markSaved);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const setStatus = useEditorStore((state) => state.setStatus);

  const mayDiscard = () => !isDirty || window.confirm(t('project.confirmDiscard'));

  const save = useCallback(async () => {
    const content = serializeProjectDocument(document);
    const filename = projectFilename(document.projectName);
    const nativeSave = window.pywebview?.api?.save_project_file;
    if (nativeSave) {
      try {
        const result = parseNativeSaveResult(await nativeSave(filename, content));
        if (result.status === 'cancelled') return;
        if (result.status === 'error') throw new Error(result.code);
        markSaved();
      } catch {
        setStatus('error.saveFailed');
      }
      return;
    }
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    window.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    markSaved();
  }, [document, markSaved, setStatus]);

  const open = useCallback(async () => {
    const nativeOpen = window.pywebview?.api?.open_project_file;
    if (!nativeOpen) {
      inputRef.current?.click();
      return;
    }
    try {
      const result = parseNativeOpenResult(await nativeOpen());
      if (result.status === 'cancelled') return;
      if (result.status === 'error') throw new Error(result.code);
      loadDocument(parseProjectDocument(result.content));
    } catch {
      setStatus('error.invalidProject');
    }
  }, [loadDocument, setStatus]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  return (
    <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.lasertisch.json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void file.text().then((content) => {
            try {
              loadDocument(parseProjectDocument(content));
            } catch {
              setStatus('error.invalidProject');
            }
          });
        }}
      />
      <Tooltip title={t('menu.new')}>
        <IconButton
          size="small"
          aria-label={t('menu.new')}
          onClick={() => { if (mayDiscard()) newProject(); }}
        >
          <CreateNewFolderRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={t('menu.open')}>
        <IconButton
          size="small"
          aria-label={t('menu.open')}
          onClick={() => { if (mayDiscard()) void open(); }}
        >
          <FolderOpenRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={`${t('menu.save')} (Ctrl/⌘+S)`}>
        <IconButton size="small" aria-label={t('menu.save')} onClick={() => void save()}>
          <SaveRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
      <Tooltip title={`${t('common.undo')} (Ctrl/⌘+Z)`}>
        <span>
          <IconButton size="small" aria-label={t('common.undo')} disabled={!canUndo} onClick={undo}>
            <UndoRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={`${t('common.redo')} (Ctrl/⌘+Y)`}>
        <span>
          <IconButton size="small" aria-label={t('common.redo')} disabled={!canRedo} onClick={redo}>
            <RedoRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
    </Stack>
  );
}
