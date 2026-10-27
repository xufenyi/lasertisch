import { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { EllipseEntity } from '../domain/model';
import { isEntityInWorkArea } from '../domain/geometry';
import { ellipseMinimumEdgeUm, isValidEllipse, MAX_ELLIPSE_SIDES, MIN_ELLIPSE_SIDES } from '../domain/ellipseGeometry';
import { formatTenthsDegrees, formatUmAsMillimetres, parseDegreesToTenths, parseMillimetresToUm } from '../domain/units';
import { useEditorStore } from '../state/editorStore';
import { commitInputOnEnter } from './inputCommit';

function valuesFor(entity: EllipseEntity) {
  return {
    x: formatUmAsMillimetres(entity.center.xUm), y: formatUmAsMillimetres(entity.center.yUm),
    width: formatUmAsMillimetres(entity.widthUm), height: formatUmAsMillimetres(entity.heightUm),
    angle: formatTenthsDegrees(entity.rotationTenthsDeg), sides: String(entity.sides),
  };
}

export function EllipseGeometryForm({ entity }: { entity: EllipseEntity }) {
  const { t } = useTranslation();
  const workArea = useEditorStore((state) => state.document.workArea);
  const replaceEntities = useEditorStore((state) => state.replaceEntities);
  const convert = useEditorStore((state) => state.convertEllipseToPolygon);
  const [values, setValues] = useState(valuesFor(entity));
  const [error, setError] = useState(false);
  useEffect(() => { setValues(valuesFor(entity)); setError(false); }, [entity]);
  const minimumEdge = ellipseMinimumEdgeUm(entity);
  const submit = () => {
    try {
      if (!/^\d+$/.test(values.sides.trim())) throw new Error('invalid side count');
      const update: EllipseEntity = {
        ...entity, center: { xUm: parseMillimetresToUm(values.x), yUm: parseMillimetresToUm(values.y) },
        widthUm: parseMillimetresToUm(values.width), heightUm: parseMillimetresToUm(values.height),
        rotationTenthsDeg: parseDegreesToTenths(values.angle), sides: Number(values.sides),
      };
      if (!isValidEllipse(update) || !isEntityInWorkArea(update, workArea)) throw new Error('invalid ellipse');
      replaceEntities([update]); setValues(valuesFor(update)); setError(false);
    } catch { setError(true); }
  };
  const field = (key: keyof typeof values, label: string) => <TextField fullWidth size="small"
    label={label} value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })}
    onBlur={submit} onKeyDown={commitInputOnEnter} error={error}
    slotProps={{ htmlInput: { inputMode: key === 'sides' ? 'numeric' : 'decimal' } }} />;
  return <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); submit(); }}>
    <Typography variant="subtitle2">{entity.name}</Typography>
    {error && <Alert severity="error">{t('error.invalidEllipse', { min: MIN_ELLIPSE_SIDES, max: MAX_ELLIPSE_SIDES })}</Alert>}
    {field('x', `${t('property.centerX')} (mm)`)}{field('y', `${t('property.centerY')} (mm)`)}
    {field('width', `${t('property.width')} (mm)`)}{field('height', `${t('property.height')} (mm)`)}
    {field('angle', `${t('property.angle')} (°)`)}{field('sides', t('ellipse.sides'))}
    <Typography variant="caption" color="text.secondary">{t('ellipse.sideRange', { min: MIN_ELLIPSE_SIDES, max: MAX_ELLIPSE_SIDES })}</Typography>
    <Alert severity="info">{t('ellipse.precisionHint')}</Alert>
    <Typography variant="caption" color="text.secondary">{t('ellipse.dimensionsHint')}</Typography>
    <Typography variant="body2">{t('ellipse.minimumEdge', {
      count: entity.sides, length: (minimumEdge / 1000).toLocaleString(undefined, { maximumFractionDigits: 6 }),
    })}</Typography>
    {minimumEdge < 100 && <Alert severity="warning">{t('ellipse.shortEdges')}</Alert>}
    <Button type="button" variant="outlined" disabled={entity.locked || !entity.visible}
      onClick={() => convert(entity.id)}>{t('ellipse.convert')}</Button>
    <Typography variant="caption" color="text.secondary">{t('ellipse.convertHint')}</Typography>
    <Typography variant="caption" color="text.secondary">{t('common.autoSave')}</Typography>
  </Stack>;
}
