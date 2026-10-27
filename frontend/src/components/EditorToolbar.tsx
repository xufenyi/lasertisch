import {
  FormControl,
  MenuItem,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import CropSquareRoundedIcon from '@mui/icons-material/CropSquareRounded';
import PolylineRoundedIcon from '@mui/icons-material/PolylineRounded';
import FitScreenRoundedIcon from '@mui/icons-material/FitScreenRounded';
import HorizontalRuleRoundedIcon from '@mui/icons-material/HorizontalRuleRounded';
import NearMeOutlinedIcon from '@mui/icons-material/NearMeOutlined';
import NearMeRoundedIcon from '@mui/icons-material/NearMeRounded';
import PanToolOutlinedIcon from '@mui/icons-material/PanToolOutlined';
import PanToolRoundedIcon from '@mui/icons-material/PanToolRounded';
import { useTranslation } from 'react-i18next';

import { supportedLanguages } from '../i18n';
import {
  FIT_WORK_AREA_SHORTCUT,
  TOOL_SHORTCUT_KEY,
} from '../editor/toolShortcuts';
import { useEditorStore } from '../state/editorStore';
import { ProjectActions } from './ProjectActions';
import { ExportActions } from './ExportActions';
import { ToolpathPreviewControl } from './ToolpathPreviewControl';

const toolButtonSx = {
  color: 'text.secondary',
  '&.Mui-selected': {
    color: '#0a4775',
    backgroundColor: 'rgba(22, 102, 167, 0.14)',
  },
  '&.Mui-selected:hover': {
    color: '#073653',
    backgroundColor: 'rgba(22, 102, 167, 0.2)',
  },
};

export function EditorToolbar({ onFit }: { onFit: () => void }) {
  const { t, i18n } = useTranslation();
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);

  return (
    <Stack className="editor-toolbar" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Typography variant="h6" sx={{ px: 1, fontWeight: 700 }}>
        LaserTisch
      </Typography>
      <ProjectActions />
      <ToggleButtonGroup exclusive size="small" value={tool} aria-label="editor tool">
        <Tooltip title={`${t('tool.select')} (${TOOL_SHORTCUT_KEY.select})`}>
          <ToggleButton
            value="select"
            aria-label={t('tool.select')}
            aria-keyshortcuts={TOOL_SHORTCUT_KEY.select}
            onClick={() => setTool('select')}
            sx={toolButtonSx}
          >
            {tool === 'select' ? <NearMeRoundedIcon /> : <NearMeOutlinedIcon />}
          </ToggleButton>
        </Tooltip>
        <Tooltip title={`${t('toolbar.pan')} (${TOOL_SHORTCUT_KEY.pan})`}>
          <ToggleButton
            value="pan"
            aria-label={t('toolbar.pan')}
            aria-keyshortcuts={TOOL_SHORTCUT_KEY.pan}
            onClick={() => setTool('pan')}
            sx={toolButtonSx}
          >
            {tool === 'pan' ? <PanToolRoundedIcon /> : <PanToolOutlinedIcon />}
          </ToggleButton>
        </Tooltip>
        <Tooltip title={`${t('toolbar.fit')} (${FIT_WORK_AREA_SHORTCUT})`}>
          <ToggleButton
            value="fit-work-area"
            aria-label={t('toolbar.fit')}
            aria-keyshortcuts="Control+0 Meta+0"
            onClick={onFit}
          >
            <FitScreenRoundedIcon />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
      <ToggleButtonGroup exclusive size="small" value={tool} aria-label="drawing tool">
        <Tooltip title={`${t('tool.line')} (${TOOL_SHORTCUT_KEY.line})`}>
          <ToggleButton
            value="line"
            aria-label={t('tool.line')}
            aria-keyshortcuts={TOOL_SHORTCUT_KEY.line}
            onClick={() => setTool('line')}
            sx={toolButtonSx}
          >
            <HorizontalRuleRoundedIcon sx={{ transform: 'rotate(-45deg)' }} />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={`${t('tool.rectangle')} (${TOOL_SHORTCUT_KEY.rectangle})`}>
          <ToggleButton
            value="rectangle"
            aria-label={t('tool.rectangle')}
            aria-keyshortcuts={TOOL_SHORTCUT_KEY.rectangle}
            onClick={() => setTool('rectangle')}
            sx={toolButtonSx}
          >
            <CropSquareRoundedIcon />
          </ToggleButton>
        </Tooltip>
        <Tooltip title={`${t('tool.polygon')} (${TOOL_SHORTCUT_KEY.polygon})`}>
          <ToggleButton value="polygon" aria-label={t('tool.polygon')}
            aria-keyshortcuts={TOOL_SHORTCUT_KEY.polygon} onClick={() => setTool('polygon')} sx={toolButtonSx}>
            <PolylineRoundedIcon />
          </ToggleButton>
        </Tooltip>
      </ToggleButtonGroup>
      <ToolpathPreviewControl />
      <ExportActions />
      <span className="toolbar-spacer" />
      <FormControl size="small" sx={{ minWidth: 125 }}>
        <Select
          value={i18n.language}
          onChange={(event) => void i18n.changeLanguage(event.target.value)}
          aria-label="language"
        >
          {supportedLanguages.map((language) => (
            <MenuItem key={language.locale} value={language.locale}>
              {language.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

