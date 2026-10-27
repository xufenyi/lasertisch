import { useEffect, useState } from 'react';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { PolygonEntity } from '../domain/model';
import { polygonRing } from '../domain/polygonEditing';
import { polygonWorldPoint } from '../domain/polygonGeometry';
import { formatUmAsMillimetres, parseMillimetresToUm } from '../domain/units';
import { useEditorStore } from '../state/editorStore';
import { commitInputOnEnter } from './inputCommit';

export function PolygonVertexForm({ entity }: { entity: PolygonEntity }) {
  const { t } = useTranslation();
  const edit = useEditorStore((state) => state.polygonEdit);
  const select = useEditorStore((state) => state.selectPolygonVertex);
  const move = useEditorStore((state) => state.moveSelectedVertex);
  const insert = useEditorStore((state) => state.insertSelectedVertex);
  const remove = useEditorStore((state) => state.deleteSelectedVertex);
  const finish = useEditorStore((state) => state.finishPolygonEdit);
  const address = edit?.entityId === entity.id ? edit.vertex : null;
  const ring = address ? polygonRing(entity, address) : null;
  const point = address && ring ? ring[address.vertexIndex] : null;
  const [values, setValues] = useState({ x: '', y: '' });
  const [error, setError] = useState(false);
  useEffect(() => {
    if (point) setValues({ x: formatUmAsMillimetres(point.xUm), y: formatUmAsMillimetres(point.yUm) });
    setError(false);
  }, [point, address?.partIndex, address?.ringIndex, address?.vertexIndex]);
  if (!address || !ring || !point) return null;
  const world = polygonWorldPoint(entity, point);
  const submit = () => {
    try {
      if (!move({ xUm: parseMillimetresToUm(values.x), yUm: parseMillimetresToUm(values.y) })) throw new Error('invalid vertex');
      setError(false);
    } catch { setError(true); }
  };
  const field = (axis: 'x' | 'y') => <TextField fullWidth size="small"
    label={`${t(axis === 'x' ? 'polygon.localX' : 'polygon.localY')} (mm)`} value={values[axis]}
    onChange={(event) => setValues({ ...values, [axis]: event.target.value })}
    onBlur={submit} onKeyDown={commitInputOnEnter} error={error}
    slotProps={{ htmlInput: { inputMode: 'decimal' } }} />;
  return <Stack spacing={1.5}>
    <Typography variant="subtitle2">{entity.name} · {t('polygon.editVertices')}</Typography>
    <Button variant="contained" onClick={finish}>{t('polygon.finishEditing')}</Button>
    <Typography variant="caption">{t('polygon.editHint')}</Typography>
    <TextField select fullWidth size="small" label={t('polygon.part')} value={address.partIndex}
      onChange={(event) => select({ partIndex: Number(event.target.value), ringIndex: 0, vertexIndex: 0 })}>
      {entity.parts.map((_, index) => <MenuItem key={index} value={index}>{t('polygon.partNumber', { count: index + 1 })}</MenuItem>)}
    </TextField>
    <TextField select fullWidth size="small" label={t('polygon.ring')} value={address.ringIndex}
      onChange={(event) => select({ ...address, ringIndex: Number(event.target.value), vertexIndex: 0 })}>
      <MenuItem value={0}>{t('polygon.outerRing')}</MenuItem>
      {entity.parts[address.partIndex].holes.map((_, index) => <MenuItem key={index} value={index + 1}>{t('polygon.holeNumber', { count: index + 1 })}</MenuItem>)}
    </TextField>
    <TextField select fullWidth size="small" label={t('polygon.vertex')} value={address.vertexIndex}
      onChange={(event) => select({ ...address, vertexIndex: Number(event.target.value) })}>
      {ring.map((_, index) => <MenuItem key={index} value={index}>{index + 1}</MenuItem>)}
    </TextField>
    {error && <Alert severity="error">{t('error.invalidPolygon')}</Alert>}
    {field('x')}{field('y')}
    <Typography variant="caption" color="text.secondary">{t('polygon.vertexCoordinates')}</Typography>
    <Typography variant="body2">{t('polygon.worldCoordinates', {
      x: formatUmAsMillimetres(world.xUm), y: formatUmAsMillimetres(world.yUm),
    })}</Typography>
    <Button variant="outlined" onClick={() => { if (!insert()) setError(true); }}>{t('polygon.insertAfter')}</Button>
    <Button variant="outlined" color="error" disabled={ring.length <= 3}
      onClick={() => { if (!remove()) setError(true); }}>{t('polygon.deleteVertex')}</Button>
    <Typography variant="caption" color="text.secondary">{t('polygon.minimumVertices')}</Typography>
  </Stack>;
}
