import { useState } from 'react';
import {
  CircularProgress,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import { useTranslation } from 'react-i18next';

import { projectFilename } from '../domain/projectFiles';
import type { ExportFormat, ToolpathPlan } from '../domain/toolpath';
import { parseNativeSaveResult } from '../desktop/desktopBridge';
import { requestDeviceExport, requestToolpathPlan } from '../planning/planningClient';
import { usePlanningStore } from '../planning/planningStore';
import { useEditorStore } from '../state/editorStore';

function downloadBase64(content: string, mediaType: string, filename: string): void {
  const binary = window.atob(content);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mediaType }));
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  window.document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFilename(projectName: string, extension: string): string {
  const savedProjectName = projectFilename(projectName);
  return `${savedProjectName.slice(0, -'.lasertisch.json'.length)}.${extension}`;
}

export function ExportActions() {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const document = useEditorStore((state) => state.document);
  const documentRevision = useEditorStore((state) => state.documentRevision);
  const setStatus = useEditorStore((state) => state.setStatus);
  const hasProcessableObject = document.entities.some(
    (entity) => entity.process.mode !== 'none',
  );

  const exportFile = async (format: ExportFormat) => {
    setAnchor(null);
    setExporting(format);
    const revision = documentRevision;
    try {
      const cached = usePlanningStore.getState();
      let plan: ToolpathPlan | null = cached.planRevision === revision ? cached.plan : null;
      if (!plan) {
        const planning = await requestToolpathPlan(document, revision);
        if (!planning.ok || !planning.plan) throw new Error('Planning failed');
        plan = planning.plan;
      }
      if (useEditorStore.getState().documentRevision !== revision) {
        throw new Error('Document changed while exporting');
      }
      const result = await requestDeviceExport(plan, revision, format);
      if (
        !result.ok || !result.contentBase64 || !result.mediaType ||
        !result.filenameExtension
      ) throw new Error(result.errors[0]?.code ?? 'Export failed');
      if (useEditorStore.getState().documentRevision !== revision) {
        throw new Error('Document changed while exporting');
      }
      const filename = exportFilename(document.projectName, result.filenameExtension);
      const nativeSave = window.pywebview?.api?.save_device_file;
      if (nativeSave) {
        const saved = parseNativeSaveResult(await nativeSave(
          filename,
          result.contentBase64,
          format,
        ));
        if (saved.status === 'cancelled') return;
        if (saved.status === 'error') throw new Error(saved.code);
      } else {
        downloadBase64(result.contentBase64, result.mediaType, filename);
      }
    } catch {
      setStatus('export.failed');
    } finally {
      setExporting(null);
    }
  };

  return (
    <>
      <Tooltip title={t('toolbar.export')}>
        <span>
          <IconButton
            size="small"
            aria-label={t('toolbar.export')}
            aria-haspopup="menu"
            disabled={!hasProcessableObject || exporting !== null}
            onClick={(event) => setAnchor(event.currentTarget)}
          >
            {exporting
              ? <CircularProgress size={20} />
              : <DownloadRoundedIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void exportFile('csv')}>
          <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('export.csv')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void exportFile('dbd')}>
          <ListItemIcon><MemoryRoundedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>{t('export.dbd')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
