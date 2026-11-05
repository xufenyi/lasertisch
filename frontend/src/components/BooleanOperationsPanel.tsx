import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Divider, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { BooleanOperation } from '../domain/boolean';
import { polygonStatistics } from '../domain/polygonGeometry';
import { BooleanUnavailableError, requestBooleanOperation } from '../planning/booleanClient';
import { useEditorStore, workspaceStateFor } from '../state/editorStore';

export function BooleanOperationsPanel() {
  const { t } = useTranslation();
  const document = useEditorStore((state) => state.document);
  const revision = useEditorStore((state) => state.documentRevision);
  const selection = useEditorStore((state) => state.selectionIds);
  const entityWorkspaceStates = useEditorStore((state) => state.entityWorkspaceStates);
  const preview = useEditorStore((state) => state.booleanPreview);
  const tool = useEditorStore((state) => state.tool);
  const editing = useEditorStore((state) => state.polygonEdit);
  const transient = useEditorStore((state) => Object.keys(state.transientEntities).length > 0 || Boolean(state.placementSession));
  const [operation, setOperation] = useState<BooleanOperation>('union');
  const [swapped, setSwapped] = useState(false);
  const [keepOriginals, setKeepOriginals] = useState(false);
  const [allowEmpty, setAllowEmpty] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const selectionKey = selection.join('|');
  const ids = swapped ? [...selection].reverse() : selection;
  const a = document.entities.find((entity) => entity.id === ids[0]);
  const b = document.entities.find((entity) => entity.id === ids[1]);
  const aWorkspace = a ? workspaceStateFor({ entityWorkspaceStates }, a.id) : null;
  const bWorkspace = b ? workspaceStateFor({ entityWorkspaceStates }, b.id) : null;
  const reason = selection.length !== 2 || !a || !b || a.id === b.id ? 'boolean.selectTwo'
    : a.kind === 'line' || b.kind === 'line' ? 'boolean.closedOnly'
      : aWorkspace?.locked || bWorkspace?.locked || !aWorkspace?.visible || !bWorkspace?.visible
        ? 'boolean.unavailableOperands' : null;
  const eligible = !reason && tool === 'select' && !editing && !transient;
  const differentProcess = a && b && JSON.stringify(a.process) !== JSON.stringify(b.process);
  const statistics = preview?.result ? polygonStatistics(preview.result) : null;

  const cancel = () => {
    pending.current++; controller.current?.abort(); controller.current = null;
    useEditorStore.getState().clearBooleanPreview();
    setPhase('idle'); setError(null); setAllowEmpty(false);
  };
  useEffect(() => { setSwapped(false); setOperation('union'); }, [selectionKey]);
  useEffect(() => {
    cancel();
    return () => {
      pending.current++; controller.current?.abort();
      useEditorStore.getState().clearBooleanPreview();
    };
  }, [revision, selectionKey, operation, swapped, tool, editing, transient, aWorkspace?.visible,
    aWorkspace?.locked, bWorkspace?.visible, bWorkspace?.locked]);

  const calculate = async () => {
    if (!eligible || !a || !b) return;
    const token = ++pending.current;
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    useEditorStore.getState().clearBooleanPreview();
    setPhase('loading'); setError(null); setAllowEmpty(false);
    try {
      const response = await requestBooleanOperation(document, revision, operation, a.id, b.id, abort.signal);
      if (token !== pending.current) return;
      if (!response.ok) { setPhase('error'); setError(`boolean.issue.${response.errors[0]?.code}`); return; }
      const accepted = useEditorStore.getState().setBooleanPreview({ requestId: response.requestId,
        documentRevision: response.documentRevision, operation, operandAId: a.id, operandBId: b.id,
        result: response.result, empty: response.empty });
      setPhase(accepted ? 'ready' : 'error');
      if (!accepted) setError('boolean.stale');
    } catch (failure) {
      if (token !== pending.current) return;
      setPhase('error'); setError(failure instanceof BooleanUnavailableError ? 'boolean.serviceUnavailable' : 'boolean.failed');
    } finally { if (controller.current === abort) controller.current = null; }
  };
  const apply = () => {
    if (!preview) return;
    const name = t('boolean.resultName', { operation: t(`boolean.${operation}`) });
    if (!useEditorStore.getState().applyBooleanPreview(preview.requestId, keepOriginals, allowEmpty, name)) {
      setPhase('error'); setError('boolean.stale');
    }
  };

  return <Stack spacing={1.25}>
    <Divider /><Typography variant="subtitle2">{t('boolean.title')}</Typography>
    {reason ? <Typography variant="body2" color="text.secondary">{t(reason)}</Typography> : <>
      <Typography variant="body2">A: {a!.name}</Typography>
      <Typography variant="body2">B: {b!.name}</Typography>
      <Button variant="outlined" onClick={() => setSwapped(!swapped)}>{t('boolean.swap')}</Button>
      <Typography variant="caption">{t('boolean.inherit', { name: a!.name })}</Typography>
      {differentProcess && <Alert severity="info">{t('boolean.differentProcess')}</Alert>}
    </>}
    <TextField select size="small" label={t('boolean.operation')} value={operation}
      onChange={(event) => setOperation(event.target.value as BooleanOperation)}>
      <MenuItem value="union">{t('boolean.union')}</MenuItem>
      <MenuItem value="intersection">{t('boolean.intersection')}</MenuItem>
      <MenuItem value="difference">{t('boolean.difference')}</MenuItem>
    </TextField>
    <FormControlLabel control={<Checkbox size="small" checked={keepOriginals}
      onChange={(_, checked) => { setKeepOriginals(checked); setAllowEmpty(false); }} />} label={t('boolean.keepOriginals')} />
    {keepOriginals && <Typography variant="caption" color="text.secondary">{t('boolean.keepHint')}</Typography>}
    <Button variant="outlined" disabled={!eligible || phase === 'loading'} onClick={() => void calculate()}>
      {t(phase === 'loading' ? 'boolean.calculating' : 'boolean.preview')}
    </Button>
    {error && <Alert severity="error">{t(error, { defaultValue: t('boolean.failed') })}</Alert>}
    {preview && <>
      <Typography variant="caption">{t('boolean.previewHint')}</Typography>
      {preview.empty ? <>
        <Alert severity="warning">{t('boolean.empty')}</Alert>
        {!keepOriginals && <FormControlLabel control={<Checkbox size="small" checked={allowEmpty}
          onChange={(_, checked) => setAllowEmpty(checked)} />} label={t('boolean.confirmEmpty')} />}
        {keepOriginals && <Typography variant="caption">{t('boolean.emptyKeep')}</Typography>}
      </> : <>
        <Typography variant="body2">{t('polygon.statistics', statistics!)}</Typography>
        <Typography variant="body2">{t('boolean.area', { area: (statistics!.areaUm2 / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 }) })}</Typography>
      </>}
      <Button variant="contained" disabled={!eligible || phase !== 'ready' || (preview.empty && (keepOriginals || !allowEmpty))}
        onClick={apply}>{t('boolean.apply')}</Button>
    </>}
    {(phase !== 'idle' || preview) && <Button onClick={cancel}>{t('boolean.cancel')}</Button>}
  </Stack>;
}
