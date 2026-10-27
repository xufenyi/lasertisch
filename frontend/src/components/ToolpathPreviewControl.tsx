import { CircularProgress, ToggleButton, Tooltip } from '@mui/material';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import { useTranslation } from 'react-i18next';

import { usePlanningStore } from '../planning/planningStore';

export function ToolpathPreviewControl() {
  const { t } = useTranslation();
  const visible = usePlanningStore((state) => state.previewVisible);
  const status = usePlanningStore((state) => state.status);
  const setVisible = usePlanningStore((state) => state.setPreviewVisible);
  return (
    <Tooltip title={t('toolbar.toolpathPreview')}>
      <ToggleButton
        size="small"
        value="toolpath-preview"
        selected={visible}
        aria-label={t('toolbar.toolpathPreview')}
        onClick={() => setVisible(!visible)}
        sx={{ position: 'relative' }}
      >
        <RouteRoundedIcon />
        {(status === 'scheduled' || status === 'planning') && (
          <CircularProgress
            size={12}
            thickness={5}
            sx={{ position: 'absolute', right: 2, bottom: 2 }}
          />
        )}
      </ToggleButton>
    </Tooltip>
  );
}
