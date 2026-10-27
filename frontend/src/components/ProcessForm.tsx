import { Divider, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import type { ProcessMode, ProcessSpec } from '../domain/model';
import {
  formatTenthsDegrees,
  formatUmAsMillimetres,
  parseDegreesToTenths,
  parseMillimetresToUm,
} from '../domain/units';
import { useEditorStore } from '../state/editorStore';

interface ProcessFormProps {
  processes: ProcessSpec[];
  supportsFill: boolean;
  onPatch: (patch: Partial<ProcessSpec>) => boolean;
  title: string;
}

function commonValue<K extends keyof ProcessSpec>(processes: ProcessSpec[], key: K): ProcessSpec[K] | null {
  const first = processes[0]?.[key];
  return processes.every((process) => process[key] === first) ? first : null;
}

function modeTranslationKey(mode: ProcessMode): string {
  return {
    none: 'process.none',
    contour: 'process.contour',
    fill: 'process.fill',
    fill_then_contour: 'process.fillThenContour',
    contour_then_fill: 'process.contourThenFill',
  }[mode];
}

export function ProcessForm({ processes, supportsFill, onPatch, title }: ProcessFormProps) {
  const { t } = useTranslation();
  const setStatus = useEditorStore((state) => state.setStatus);
  const mode = commonValue(processes, 'mode');
  const speed = commonValue(processes, 'markSpeedUmPerSec');
  const fillAngle = commonValue(processes, 'fillAngleTenthsDeg');
  const hatchSpacing = commonValue(processes, 'hatchSpacingUm');
  const direction = commonValue(processes, 'contourDirection');
  const modes: ProcessMode[] = supportsFill
    ? ['none', 'contour', 'fill', 'fill_then_contour', 'contour_then_fill']
    : ['none', 'contour'];

  const numericField = (
    key: string,
    label: string,
    value: number | null,
    format: (source: number) => string,
    parse: (source: string) => number,
    patch: (parsed: number) => Partial<ProcessSpec>,
  ) => (
    <TextField
      key={`${key}-${value ?? 'mixed'}`}
      size="small"
      type="number"
      label={label}
      defaultValue={value === null ? '' : format(value)}
      placeholder={value === null ? t('common.mixed') : undefined}
      slotProps={{ htmlInput: { inputMode: 'decimal', step: 'any' } }}
      onBlur={(event) => {
        if (!event.target.value.trim()) return;
        try {
          if (!onPatch(patch(parse(event.target.value)))) throw new Error('rejected');
        } catch {
          setStatus('error.invalidValue');
        }
      }}
    />
  );

  return (
    <Stack spacing={1.25}>
      <Divider />
      <Typography variant="subtitle2">{title}</Typography>
      <FormControl size="small" fullWidth>
        <InputLabel>{t('property.processMode')}</InputLabel>
        <Select
          value={mode ?? ''}
          label={t('property.processMode')}
          displayEmpty={mode === null}
          onChange={(event) => onPatch({ mode: event.target.value as ProcessMode })}
        >
          {mode === null && <MenuItem value="" disabled>{t('common.mixed')}</MenuItem>}
          {modes.map((item) => <MenuItem key={item} value={item}>{t(modeTranslationKey(item))}</MenuItem>)}
        </Select>
      </FormControl>
      {numericField(
        'speed',
        `${t('property.markSpeed')} (${t('unit.millimetresPerSecond')})`,
        speed,
        formatUmAsMillimetres,
        parseMillimetresToUm,
        (markSpeedUmPerSec) => ({ markSpeedUmPerSec }),
      )}
      {supportsFill && numericField(
        'fill-angle',
        `${t('property.fillAngle')} (°)`,
        fillAngle,
        formatTenthsDegrees,
        parseDegreesToTenths,
        (fillAngleTenthsDeg) => ({ fillAngleTenthsDeg }),
      )}
      {supportsFill && numericField(
        'hatch-spacing',
        `${t('property.hatchSpacing')} (mm)`,
        hatchSpacing,
        formatUmAsMillimetres,
        parseMillimetresToUm,
        (hatchSpacingUm) => ({ hatchSpacingUm }),
      )}
      {supportsFill && (
        <FormControl size="small" fullWidth>
          <InputLabel>{t('property.contourDirection')}</InputLabel>
          <Select
            value={direction ?? ''}
            label={t('property.contourDirection')}
            displayEmpty={direction === null}
            onChange={(event) => onPatch({
              contourDirection: event.target.value as ProcessSpec['contourDirection'],
            })}
          >
            {direction === null && <MenuItem value="" disabled>{t('common.mixed')}</MenuItem>}
            <MenuItem value="clockwise">{t('process.clockwise')}</MenuItem>
            <MenuItem value="counterclockwise">{t('process.counterclockwise')}</MenuItem>
          </Select>
        </FormControl>
      )}
      <Typography variant="caption" color="text.secondary">{t('common.autoSave')}</Typography>
    </Stack>
  );
}
