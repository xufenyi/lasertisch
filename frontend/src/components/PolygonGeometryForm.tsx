import { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

import type { PolygonEntity } from '../domain/model';
import { isEntityInWorkArea } from '../domain/geometry';
import { isValidPolygon, polygonBounds, polygonStatistics, resizePolygon } from '../domain/polygonGeometry';
import { formatTenthsDegrees, formatUmAsMillimetres, parseDegreesToTenths, parseMillimetresToUm } from '../domain/units';
import { useEditorStore } from '../state/editorStore';
import { commitInputOnEnter } from './inputCommit';

function valuesFor(entity: PolygonEntity) {
  const bounds = polygonBounds(entity);
  return {
    x: formatUmAsMillimetres(entity.position.xUm), y: formatUmAsMillimetres(entity.position.yUm),
    width: formatUmAsMillimetres(bounds.widthUm), height: formatUmAsMillimetres(bounds.heightUm),
    angle: formatTenthsDegrees(entity.rotationTenthsDeg),
  };
}

export function PolygonGeometryForm({ entity }: { entity: PolygonEntity }) {
  const { t } = useTranslation();
  const workArea = useEditorStore((state) => state.document.workArea);
  const replaceEntities = useEditorStore((state) => state.replaceEntities);
  const startPolygonEdit = useEditorStore((state) => state.startPolygonEdit);
  const [values, setValues] = useState(valuesFor(entity));
  const [error, setError] = useState(false);
  useEffect(() => { setValues(valuesFor(entity)); setError(false); }, [entity]);
  const statistics = polygonStatistics(entity);

  const submit = () => {
    try {
      const bounds = polygonBounds(entity);
      const width = parseMillimetresToUm(values.width);
      const height = parseMillimetresToUm(values.height);
      const update = {
        ...(width === bounds.widthUm && height === bounds.heightUm ? entity : resizePolygon(entity, width, height)),
        position: { xUm: parseMillimetresToUm(values.x), yUm: parseMillimetresToUm(values.y) },
        rotationTenthsDeg: parseDegreesToTenths(values.angle),
      };
      if (!isValidPolygon(update) || !isEntityInWorkArea(update, workArea)) throw new Error('invalid polygon');
      replaceEntities([update]);
      setValues(valuesFor(update)); setError(false);
    } catch { setError(true); }
  };

  const field = (key: keyof typeof values, label: string) => (
    <TextField size="small" fullWidth label={label} value={values[key]}
      onChange={(event) => setValues({ ...values, [key]: event.target.value })}
      onBlur={submit} onKeyDown={commitInputOnEnter}
      error={error} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
  );
  return (
    <Stack component="form" spacing={1.5} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Typography variant="subtitle2">{entity.name}</Typography>
      <Button type="button" variant="outlined" disabled={entity.locked || !entity.visible}
        onClick={() => startPolygonEdit(entity.id)}>{t('polygon.editVertices')}</Button>
      {error && <Alert severity="error">{t('error.invalidPolygon')}</Alert>}
      {field('x', `${t('property.positionX')} (mm)`)}
      {field('y', `${t('property.positionY')} (mm)`)}
      {field('width', `${t('property.localWidth')} (mm)`)}
      {field('height', `${t('property.localHeight')} (mm)`)}
      {field('angle', `${t('property.angle')} (°)`)}
      <Typography variant="caption" color="text.secondary">{t('polygon.localCoordinates')}</Typography>
      <Typography variant="body2">{t('polygon.statistics', statistics)}</Typography>
      <Typography variant="body2">{t('polygon.measurements', {
        area: (statistics.areaUm2 / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 }),
        length: (statistics.perimeterUm / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }),
      })}</Typography>
      <Typography variant="caption" color="text.secondary">{t('common.autoSave')}</Typography>
    </Stack>
  );
}
