import { useEffect, useState } from 'react';
import { TextEditorPanel } from './TextEditorPanel';
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import { useTranslation } from 'react-i18next';

import { formatUmAsMillimetres, parseMillimetresToUm } from '../domain/units';
import type { EditableEntity, EntityId, WorkAreaSettings } from '../domain/model';
import { useEditorStore } from '../state/editorStore';
import { GeometryForm } from './GeometryForm';
import { PolygonVertexForm } from './PolygonVertexForm';
import { ProcessForm } from './ProcessForm';
import { commitInputOnEnter } from './inputCommit';
import { BooleanOperationsPanel } from './BooleanOperationsPanel';

function ProjectNameField({ name }: { name: string }) {
  const { t } = useTranslation();
  const updateProjectName = useEditorStore((state) => state.updateProjectName);
  return (
    <TextField
      key={name}
      size="small"
      label={t('project.name')}
      defaultValue={name}
      slotProps={{ htmlInput: { maxLength: 200 } }}
      onKeyDown={commitInputOnEnter}
      onBlur={(event) => {
        if (!updateProjectName(event.target.value)) event.target.value = name;
      }}
    />
  );
}

function WorkAreaFields({ workArea }: { workArea: WorkAreaSettings }) {
  const { t } = useTranslation();
  const updateWorkArea = useEditorStore((state) => state.updateWorkArea);

  const field = (
    label: string,
    valueUm: number,
    update: (valueUm: number) => WorkAreaSettings,
  ) => (
    <TextField
      key={`${label}-${valueUm}`}
      size="small"
      label={`${label} (mm)`}
      defaultValue={formatUmAsMillimetres(valueUm)}
      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      onKeyDown={commitInputOnEnter}
      onBlur={(event) => {
        try {
          const value = parseMillimetresToUm(event.target.value);
          if (!updateWorkArea(update(value))) throw new Error('rejected');
        } catch {
          event.target.value = formatUmAsMillimetres(valueUm);
        }
      }}
    />
  );

  return (
    <>
      {field(t('panel.workAreaWidth'), workArea.widthUm, (widthUm) => ({ ...workArea, widthUm }))}
      {field(t('panel.workAreaHeight'), workArea.heightUm, (heightUm) => ({ ...workArea, heightUm }))}
      {field(t('panel.workAreaCenterX'), workArea.center.xUm, (xUm) => ({
        ...workArea, center: { ...workArea.center, xUm },
      }))}
      {field(t('panel.workAreaCenterY'), workArea.center.yUm, (yUm) => ({
        ...workArea, center: { ...workArea.center, yUm },
      }))}
    </>
  );
}

function GridSpacingField({ spacingUm }: { spacingUm: number }) {
  const { t } = useTranslation();
  const updateGrid = useEditorStore((state) => state.updateGrid);
  const setStatus = useEditorStore((state) => state.setStatus);
  const [value, setValue] = useState(formatUmAsMillimetres(spacingUm));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setValue(formatUmAsMillimetres(spacingUm));
    setInvalid(false);
  }, [spacingUm]);

  return (
    <TextField
      size="small"
      type="number"
      label={`${t('panel.gridSpacing')} (mm)`}
      value={value}
      error={invalid}
      helperText={invalid ? t('error.invalidGridSpacing') : undefined}
      slotProps={{ htmlInput: { inputMode: 'decimal', min: 0.001, max: 190, step: 'any' } }}
      onChange={(event) => {
        setValue(event.target.value);
        if (invalid) setInvalid(false);
      }}
      onKeyDown={commitInputOnEnter}
      onBlur={() => {
        try {
          const nextSpacingUm = parseMillimetresToUm(value);
          if (nextSpacingUm <= 0 || nextSpacingUm > 190_000) throw new Error('invalid');
          updateGrid({ spacingUm: nextSpacingUm });
          setInvalid(false);
          setStatus(null);
        } catch {
          setInvalid(true);
          setStatus('error.invalidGridSpacing');
        }
      }}
    />
  );
}

function GlobalSettingsFields() {
  const { t } = useTranslation();
  const settings = useEditorStore((state) => state.document.globalSettings);
  const updateGlobalSettings = useEditorStore((state) => state.updateGlobalSettings);
  const setStatus = useEditorStore((state) => state.setStatus);
  return (
    <Stack spacing={1.25}>
      <Divider />
      <Typography variant="subtitle2">{t('panel.globalSettings')}</Typography>
      <TextField
        key={settings.travelSpeedUmPerSec}
        size="small"
        type="number"
        label={`${t('property.travelSpeed')} (${t('unit.millimetresPerSecond')})`}
        defaultValue={formatUmAsMillimetres(settings.travelSpeedUmPerSec)}
        slotProps={{ htmlInput: { inputMode: 'decimal', min: 0.001, step: 'any' } }}
        onKeyDown={commitInputOnEnter}
        onBlur={(event) => {
          try {
            const travelSpeedUmPerSec = parseMillimetresToUm(event.target.value);
            if (!updateGlobalSettings({ travelSpeedUmPerSec })) throw new Error('rejected');
          } catch {
            event.target.value = formatUmAsMillimetres(settings.travelSpeedUmPerSec);
            setStatus('error.invalidValue');
          }
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {t('panel.fixedGlobalRules')}
      </Typography>
    </Stack>
  );
}

function ObjectListItem({
  entity,
  selected,
  onSelect,
  orderIndex,
  orderLength,
  onMove,
}: {
  entity: EditableEntity;
  selected: boolean;
  onSelect: (event: React.MouseEvent) => void;
  orderIndex: number;
  orderLength: number;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const renameEntity = useEditorStore((state) => state.renameEntity);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entity.name);

  useEffect(() => {
    if (!editing) setDraft(entity.name);
  }, [editing, entity.name]);

  const finishEditing = () => {
    if (!renameEntity(entity.id, draft)) setDraft(entity.name);
    setEditing(false);
  };

  return (
    <ListItem
      disablePadding
      secondaryAction={(
        <Stack direction="row" spacing={0}>
          <Tooltip title={t('panel.moveEarlier')}>
            <span><IconButton
              size="small"
              disabled={orderIndex === 0}
              aria-label={t('panel.moveEarlier')}
              onClick={(event) => { event.stopPropagation(); onMove(-1); }}
            ><ArrowUpwardRoundedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
          <Tooltip title={t('panel.moveLater')}>
            <span><IconButton
              size="small"
              disabled={orderIndex === orderLength - 1}
              aria-label={t('panel.moveLater')}
              onClick={(event) => { event.stopPropagation(); onMove(1); }}
            ><ArrowDownwardRoundedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
          <Tooltip title={t('panel.rename')}>
            <IconButton
              size="small"
              edge="end"
              aria-label={t('panel.rename')}
              onClick={(event) => {
                event.stopPropagation();
                setDraft(entity.name);
                setEditing(true);
              }}
            >
              <EditRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}
    >
      <ListItemButton component="div" selected={selected} onClick={onSelect} sx={{ pr: 14 }}>
        {editing ? (
          <TextField
            autoFocus
            fullWidth
            size="small"
            value={draft}
            slotProps={{ htmlInput: { maxLength: 200 } }}
            onChange={(event) => setDraft(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') commitInputOnEnter(event);
              if (event.key === 'Escape') {
                setDraft(entity.name);
                setEditing(false);
              }
            }}
            onBlur={finishEditing}
          />
        ) : (
          <ListItemText
            primary={entity.name}
            secondary={`${orderIndex + 1}. ${t(`tool.${entity.kind}`)}`}
          />
        )}
      </ListItemButton>
    </ListItem>
  );
}

export function PropertiesPanel() {
  const { t } = useTranslation();
  const document = useEditorStore((state) => state.document);
  const transientEntities = useEditorStore((state) => state.transientEntities);
  const selectionIds = useEditorStore((state) => state.selectionIds);
  const polygonEdit = useEditorStore((state) => state.polygonEdit);
  const textSession = useEditorStore((state)=>state.textSession);
  const setSelection = useEditorStore((state) => state.setSelection);
  const updateGrid = useEditorStore((state) => state.updateGrid);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const updateSelectedProcess = useEditorStore((state) => state.updateSelectedProcess);
  const updateDefaultProcess = useEditorStore((state) => state.updateDefaultProcess);
  const moveProcessingOrder = useEditorStore((state) => state.moveProcessingOrder);
  const selected = document.entities
    .filter((entity) => selectionIds.includes(entity.id))
    .map((entity) => transientEntities[entity.id] ?? entity);
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const orderedEntities = document.processingOrder
    .map((id) => byId.get(id))
    .filter((entity): entity is EditableEntity => Boolean(entity));

  if(textSession) return <Box className="properties-panel"><TextEditorPanel key={textSession.id} session={textSession} /></Box>;
  return (
    <Box className="properties-panel">
      <Typography variant="overline" color="text.secondary">
        {t('panel.properties')}
      </Typography>
      <Box sx={{ mt: 1 }}>
        {selected.length === 1 ? (
          <Stack spacing={1.5}>
            {selected[0].kind === 'polygon' && polygonEdit?.entityId === selected[0].id
              ? <PolygonVertexForm entity={selected[0]} /> : <GeometryForm entity={selected[0]} />}
            <ProcessForm
              title={t('panel.processing')}
              processes={[selected[0].process]}
              supportsFill={selected[0].kind !== 'line'}
              onPatch={updateSelectedProcess}
            />
          </Stack>
        ) : selected.length > 1 ? (
          <Stack spacing={1.5}>
            <Typography>{t('panel.selectionCount', { count: selected.length })}</Typography>
            <BooleanOperationsPanel />
            <ProcessForm
              title={t('panel.batchProcessing')}
              processes={selected.map((entity) => entity.process)}
              supportsFill={selected.every((entity) => entity.kind !== 'line')}
              onPatch={updateSelectedProcess}
            />
            <Button color="error" variant="outlined" onClick={deleteSelected}>
              {t('common.delete')}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.25}>
            <ProjectNameField name={document.projectName} />
            <Divider />
            <Typography variant="subtitle2">{t('panel.workArea')}</Typography>
            <WorkAreaFields workArea={document.workArea} />
            <Divider />
            <Typography variant="subtitle2">{t('panel.grid')}</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={document.grid.visible}
                  onChange={(_, checked) => updateGrid({ visible: checked })}
                />
              }
              label={t('panel.grid')}
            />
            <GridSpacingField spacingUm={document.grid.spacingUm} />
            <FormControlLabel
              control={
                <Switch
                  checked={document.grid.snapMove}
                  onChange={(_, checked) => updateGrid({ snapMove: checked })}
                />
              }
              label={t('panel.snapMove')}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={document.grid.snapResize}
                  onChange={(_, checked) => updateGrid({ snapResize: checked })}
                />
              }
              label={t('panel.snapResize')}
            />
            <ProcessForm
              title={t('panel.defaultProcessing')}
              processes={[document.defaultProcess]}
              supportsFill
              onPatch={updateDefaultProcess}
            />
            <GlobalSettingsFields />
          </Stack>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        {t('panel.objects')}
      </Typography>
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {orderedEntities.map((entity, orderIndex) => (
          <ObjectListItem
            key={entity.id}
            entity={entity}
            selected={selectionIds.includes(entity.id)}
            orderIndex={orderIndex}
            orderLength={orderedEntities.length}
            onMove={(direction) => moveProcessingOrder(entity.id, direction)}
            onSelect={(event) => {
              if (event.ctrlKey || event.metaKey) {
                setSelection(
                  selectionIds.includes(entity.id)
                    ? selectionIds.filter((id) => id !== entity.id)
                    : [...selectionIds, entity.id],
                );
              } else {
                setSelection([entity.id]);
              }
            }}
          />
        ))}
      </List>
    </Box>
  );
}

