import { useEffect, useState } from 'react';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TextEntity } from '../domain/model';
import { shortEdgeStatistics } from '../domain/textGeometry';
import { formatTenthsDegrees,formatUmAsMillimetres,parseDegreesToTenths,parseMillimetresToUm } from '../domain/units';
import { isEntityInWorkArea } from '../domain/geometry';
import { isValidPolygon } from '../domain/polygonGeometry';
import { useEditorStore } from '../state/editorStore';
import { commitInputOnEnter } from './inputCommit';

function valuesFor(entity:TextEntity) {return {x:formatUmAsMillimetres(entity.position.xUm),y:formatUmAsMillimetres(entity.position.yUm),angle:formatTenthsDegrees(entity.rotationTenthsDeg)};}
export function TextGeometryForm({entity}:{entity:TextEntity}) {
  const {t}=useTranslation();const [values,setValues]=useState(valuesFor(entity));const [error,setError]=useState(false);
  useEffect(()=>{setValues(valuesFor(entity));setError(false);},[entity]);
  const stats=shortEdgeStatistics(entity,entity.text.shortSegmentTargetUm);
  const submit=()=>{
    try {
      const next={...entity,position:{xUm:parseMillimetresToUm(values.x),yUm:parseMillimetresToUm(values.y)},rotationTenthsDeg:parseDegreesToTenths(values.angle)};
      if(!isValidPolygon(next) || !isEntityInWorkArea(next,useEditorStore.getState().document.workArea))throw new Error('bounds');
      useEditorStore.getState().replaceEntities([next]);setError(false);
    }catch{setError(true);}
  };
  return <Stack spacing={1.5} component="form" onSubmit={e=>{e.preventDefault();submit();}}>
    <Typography variant="subtitle2">{entity.name}</Typography>
    <Typography sx={{overflowWrap:'anywhere'}}>{entity.text.content}</Typography>
    <Typography variant="body2">{entity.text.font.family} · {entity.text.font.style}</Typography>
    <Typography variant="body2">{t('text.parameters',{size:formatUmAsMillimetres(entity.text.fontSizeUm),tolerance:formatUmAsMillimetres(entity.text.curveToleranceUm),target:formatUmAsMillimetres(entity.text.shortSegmentTargetUm)})}</Typography>
    <Button disabled={entity.locked || !entity.visible} onClick={()=>useEditorStore.getState().beginText(entity.position,entity.id)}>{t('text.edit')}</Button>
    {(['x','y','angle'] as const).map(key=><TextField key={key} size="small" label={`${t(key==='angle' ? 'property.angle' : key==='x' ? 'property.positionX' : 'property.positionY')} (${key==='angle' ? '°' : 'mm'})`}
      value={values[key]} onChange={e=>setValues({...values,[key]:e.target.value})} disabled={entity.locked}
      slotProps={{htmlInput:{inputMode:'decimal'}}} onBlur={submit} onKeyDown={commitInputOnEnter} />)}
    {error && <Alert severity="error">{t('text.invalidPlacement')}</Alert>}
    <Typography variant="body2">{t('text.statistics',{count:stats.vertices,minimum:(stats.minimumUm/1000).toFixed(6),remaining:stats.shortEdges.length})}</Typography>
    <Typography variant="caption">{t('text.transformHint')}</Typography>
    <Button disabled={entity.locked || !entity.visible} variant="outlined" onClick={()=>useEditorStore.getState().convertTextToPolygon(entity.id)}>{t('text.convert')}</Button>
    <Typography variant="caption">{t('text.convertHint')}</Typography>
  </Stack>;
}
