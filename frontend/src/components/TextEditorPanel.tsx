import { useEffect, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { createEntityId, type TextEntity } from '../domain/model';
import type { FontReference, TextParameters } from '../domain/text';
import { shortEdgeStatistics } from '../domain/textGeometry';
import { parseDegreesToTenths, parseMillimetresToUm, formatTenthsDegrees, formatUmAsMillimetres } from '../domain/units';
import { requestTextOutline } from '../planning/textClient';
import { loadFontCatalog, useFontCatalogStore } from '../state/fontCatalogStore';
import { useEditorStore, type TextSession } from '../state/editorStore';

export function TextEditorPanel({session}: {session: TextSession}) {
  const {t}=useTranslation();
  const initial=useRef(useEditorStore.getState().document.entities.find(e=>e.id===session.entityId));
  const original=initial.current?.kind==='text' ? initial.current : null;
  const id=useRef(original?.id ?? createEntityId());
  const [content,setContent]=useState(original?.text.content ?? '');
  const [font,setFont]=useState<FontReference|null>(original?.text.font ?? null);
  const fonts=useFontCatalogStore(s=>s.fonts);
  const catalogStatus=useFontCatalogStore(s=>s.status);
  const defaultFontId=useFontCatalogStore(s=>s.defaultFontId);
  const catalogLoading=catalogStatus==='idle' || catalogStatus==='loading';
  const [values,setValues]=useState({size:formatUmAsMillimetres(original?.text.fontSizeUm ?? 10000),
    tolerance:formatUmAsMillimetres(original?.text.curveToleranceUm ?? 5),target:formatUmAsMillimetres(original?.text.shortSegmentTargetUm ?? 0),
    x:formatUmAsMillimetres(session.position.xUm),y:formatUmAsMillimetres(session.position.yUm),angle:formatTenthsDegrees(original?.rotationTenthsDeg ?? 0)});
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [warnings,setWarnings]=useState<string[]>([]);
  const preview=useEditorStore(s=>s.textPreview);
  const token=useRef(0),controller=useRef<AbortController|null>(null);
  const statistics=preview ? shortEdgeStatistics(preview,preview.text.shortSegmentTargetUm) : null;
  const label=(item:FontReference)=>`${item.family} · ${item.style}${item.bundled ? ` (${t('text.bundled')})` : ''}`;
  const invalidate=()=>{
    token.current++;controller.current?.abort();setLoading(false);setError(null);setWarnings([]);
    useEditorStore.getState().setTextPreview(null,session.id);
  };
  useEffect(()=>{setFont(current=>current ?? fonts.find(f=>f.id===defaultFontId) ?? null);},[fonts,defaultFontId]);
  useEffect(()=>{
    return ()=>{token.current++;controller.current?.abort();};
  },[]);

  const calculate=async ()=>{
    invalidate();
    let parameters:TextParameters,position:{xUm:number;yUm:number},rotationTenthsDeg:number;
    try {
      const fontSizeUm=parseMillimetresToUm(values.size),curveToleranceUm=parseMillimetresToUm(values.tolerance),shortSegmentTargetUm=parseMillimetresToUm(values.target);
      if(!font || !content.trim() || Array.from(content).length>256 || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(content) ||
        fontSizeUm<=0 || fontSizeUm>190000 || curveToleranceUm<1 || curveToleranceUm>1000 || shortSegmentTargetUm<0 || shortSegmentTargetUm>190000) throw new Error('invalid');
      parameters={content,fontId:font.id,fontSizeUm,curveToleranceUm,shortSegmentTargetUm};
      position={xUm:parseMillimetresToUm(values.x),yUm:parseMillimetresToUm(values.y)};rotationTenthsDeg=parseDegreesToTenths(values.angle);
    } catch {setError(t('text.invalidParameters'));return;}
    const own=++token.current;const abort=new AbortController();controller.current=abort;setLoading(true);
    try {
      const result=await requestTextOutline(parameters,session.revision,abort.signal);
      if(own!==token.current || useEditorStore.getState().textSession?.id!==session.id)return;
      if(!result.ok || !result.snapshot) {
        const issue=result.errors[0];setError(t(`text.issue.${issue?.code}`,{...issue?.parameters,defaultValue:t('text.conversionFailed')}));return;
      }
      const snapshot=result.snapshot;
      const entity:TextEntity={id:id.current,name:original?.name ?? `${t('tool.text')} ${useEditorStore.getState().document.entities.length+1}`,
        kind:'text',visible:true,locked:false,process:{...(original?.process ?? useEditorStore.getState().document.defaultProcess)},
        position,rotationTenthsDeg,parts:structuredClone(snapshot.parts),text:structuredClone(snapshot.source),
        generatorVersion:snapshot.generatorVersion,engineVersions:{...snapshot.engineVersions}};
      if(!useEditorStore.getState().setTextPreview(entity,session.id)) {setError(t('text.invalidPlacement'));return;}
      setWarnings(result.warnings.map(issue=>t(`text.issue.${issue.code}`,{...issue.parameters,defaultValue:t('text.conversionWarning')})));
    } catch(e) {if(own===token.current && !(e instanceof DOMException && e.name==='AbortError'))setError(t('text.conversionFailed'));}
    finally {if(own===token.current)setLoading(false);}
  };
  const field=(key:keyof typeof values,label:string)=> <TextField size="small" label={label} value={values[key]}
    slotProps={{htmlInput:{inputMode:'decimal'}}} onChange={e=>{invalidate();setValues({...values,[key]:e.target.value});}} />;
  const options=font && !fonts.some(f=>f.id===font.id) ? [font,...fonts] : fonts;
  return <Stack spacing={1.5} component="form" onSubmit={e=>{e.preventDefault();void calculate();}}>
    <Typography variant="subtitle2">{t(original ? 'text.edit' : 'text.create')}</Typography>
    <TextField autoFocus size="small" label={t('text.content')} value={content} slotProps={{htmlInput:{maxLength:512}}}
      onChange={e=>{invalidate();setContent(e.target.value);}} />
    <Autocomplete options={options} value={font} getOptionLabel={label} isOptionEqualToValue={(a,b)=>a.id===b.id}
      getOptionKey={item=>item.id} size="small" onChange={(_,value)=>{invalidate();setFont(value);}}
      renderInput={params=><TextField {...params} label={t('text.font')} />} />
    {catalogLoading && <Typography component="div" role="status" variant="caption" sx={{display:'flex',alignItems:'center',gap:1}}>
      <CircularProgress size={12} />{t('text.loadingFonts')}
    </Typography>}
    {catalogStatus==='error' && <Alert severity="warning">{t('text.catalogFailed')}</Alert>}
    {font && !catalogLoading && !fonts.some(f=>f.id===font.id) && <Alert severity="warning">{t('text.fontMissing')}</Alert>}
    <Button type="button" size="small" disabled={catalogLoading} onClick={()=>void loadFontCatalog(true)}>{t('text.refreshFonts')}</Button>
    {field('size',`${t('text.fontSize')} (mm)`)}
    {field('tolerance',`${t('text.tolerance')} (mm)`)}
    {field('target',`${t('text.shortTarget')} (mm)`)}
    <Typography variant="caption" color="text.secondary">{t('text.shortHint')}</Typography>
    <Typography variant="caption" color="text.secondary">{t('text.sizeHint')}</Typography>
    {field('x',`${t('property.positionX')} (mm)`)}{field('y',`${t('property.positionY')} (mm)`)}{field('angle',`${t('property.angle')} (°)`)}
    {error && <Alert severity="error">{error}</Alert>}
    {warnings.map((warning,i)=><Alert key={i} severity="warning">{warning}</Alert>)}
    {statistics && <Typography variant="body2">{t('text.statistics',{count:statistics.vertices,minimum:(statistics.minimumUm/1000).toFixed(6),remaining:statistics.shortEdges.length})}</Typography>}
    <Button type="submit" variant="outlined" disabled={loading || !font}>{loading ? t('text.generating') : t('text.preview')}</Button>
    <Button type="button" variant="contained" disabled={!preview || loading} onClick={()=>{
      if(!useEditorStore.getState().applyTextPreview(session.id))setError(t('text.stale'));
    }}>{t('text.apply')}</Button>
    <Button type="button" onClick={()=>{invalidate();useEditorStore.getState().cancelText();}}>{t('common.cancel')}</Button>
  </Stack>;
}
