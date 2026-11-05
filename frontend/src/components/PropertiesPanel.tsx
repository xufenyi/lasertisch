import { useEffect, useRef, useState } from 'react';
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
import LockOpenRoundedIcon from '@mui/icons-material/LockOpenRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { useTranslation } from 'react-i18next';

import { formatUmAsMillimetres, parseMillimetresToUm } from '../domain/units';
import type { EditableEntity, EntityId, EntityWorkspaceState, WorkAreaSettings } from '../domain/model';
import { useEditorStore, workspaceStateFor } from '../state/editorStore';
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
  workspaceState,
  selected,
  onSelect,
  orderIndex,
  dragging,
  dropSide,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  entity: EditableEntity;
  workspaceState: Readonly<EntityWorkspaceState>;
  selected: boolean;
  onSelect: (event: React.MouseEvent) => void;
  orderIndex: number;
  dragging: boolean;
  dropSide: 'before' | 'after' | null;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent, side: 'before' | 'after') => void;
  onDrop: (event: React.DragEvent, side: 'before' | 'after') => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  const renameEntity = useEditorStore((state) => state.renameEntity);
  const toggleVisibility = useEditorStore((state) => state.toggleEntityVisibility);
  const toggleLocked = useEditorStore((state) => state.toggleEntityLocked);
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
      onDragOver={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onDragOver(event, event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after');
      }}
      onDrop={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        onDrop(event, event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after');
      }}
      sx={{
        opacity: dragging ? 0.45 : 1,
        backgroundColor: selected ? 'rgba(22, 102, 167, 0.08)' : 'transparent',
        borderTop: '2px solid',
        borderBottom: '2px solid',
        borderTopColor: dropSide === 'before' ? 'primary.main' : 'transparent',
        borderBottomColor: dropSide === 'after' ? 'primary.main' : 'transparent',
        transition: 'background-color 120ms ease',
        '&:hover': {
          backgroundColor: selected
            ? 'rgba(22, 102, 167, 0.08)'
            : 'rgba(0, 0, 0, 0.04)',
        },
      }}
    >
      <Tooltip title={t(workspaceState.visible ? 'panel.hide' : 'panel.show')}>
        <IconButton
          size="small"
          aria-label={t(workspaceState.visible ? 'panel.hide' : 'panel.show')}
          onClick={(event) => { event.stopPropagation(); toggleVisibility(entity.id); }}
        >
          {workspaceState.visible
            ? <VisibilityRoundedIcon fontSize="small" />
            : <VisibilityOffRoundedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <Tooltip title={t(workspaceState.locked ? 'panel.unlock' : 'panel.lock')}>
        <IconButton
          size="small"
          color={workspaceState.locked ? 'primary' : 'default'}
          aria-label={t(workspaceState.locked ? 'panel.unlock' : 'panel.lock')}
          onClick={(event) => { event.stopPropagation(); toggleLocked(entity.id); }}
        >
          {workspaceState.locked
            ? <LockRoundedIcon fontSize="small" />
            : <LockOpenRoundedIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
      <ListItemButton component="div" selected={selected} onClick={onSelect}
        sx={{
          minWidth: 0,
          px: 0.75,
          opacity: workspaceState.visible ? 1 : 0.58,
          backgroundColor: 'transparent',
          '&:hover, &.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: 'transparent',
          },
        }}>
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
      <Tooltip title={t('panel.rename')}>
        <IconButton
          size="small"
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
      <Tooltip title={t('panel.reorder')}>
        <IconButton
          size="small"
          draggable
          aria-label={t('panel.reorder')}
          onClick={(event) => event.stopPropagation()}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          sx={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <MenuRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </ListItem>
  );
}

export function PropertiesPanel() {
  const { t } = useTranslation();
  const document = useEditorStore((state) => state.document);
  const transientEntities = useEditorStore((state) => state.transientEntities);
  const selectionIds = useEditorStore((state) => state.selectionIds);
  const entityWorkspaceStates = useEditorStore((state) => state.entityWorkspaceStates);
  const polygonEdit = useEditorStore((state) => state.polygonEdit);
  const textSession = useEditorStore((state)=>state.textSession);
  const setSelection = useEditorStore((state) => state.setSelection);
  const updateGrid = useEditorStore((state) => state.updateGrid);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const updateSelectedProcess = useEditorStore((state) => state.updateSelectedProcess);
  const updateDefaultProcess = useEditorStore((state) => state.updateDefaultProcess);
  const moveProcessingOrder = useEditorStore((state) => state.moveProcessingOrder);
  const [draggingId, setDraggingId] = useState<EntityId | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: EntityId; side: 'before' | 'after' } | null>(null);
  const draggingIdRef = useRef<EntityId | null>(null);
  const dropTargetRef = useRef<{ id: EntityId; side: 'before' | 'after' } | null>(null);
  const selected = document.entities
    .filter((entity) => selectionIds.includes(entity.id))
    .map((entity) => transientEntities[entity.id] ?? entity);
  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const orderedEntities = document.processingOrder
    .map((id) => byId.get(id))
    .filter((entity): entity is EditableEntity => Boolean(entity));
  const selectedLocked = selected.some((entity) =>
    (entityWorkspaceStates[entity.id]?.locked ?? false));

  const finishDrag = () => {
    draggingIdRef.current = null;
    dropTargetRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
  };

  const dropProcessingOrder = (directTarget?: { id: EntityId; side: 'before' | 'after' }) => {
    const dragged = draggingIdRef.current;
    const target = directTarget ?? dropTargetRef.current;
    if (!dragged || !target) { finishDrag(); return; }
    const sourceIndex = document.processingOrder.indexOf(dragged);
    const targetIndex = document.processingOrder.indexOf(target.id);
    if (sourceIndex >= 0 && targetIndex >= 0) {
      let destination = targetIndex + (target.side === 'after' ? 1 : 0);
      if (sourceIndex < destination) destination -= 1;
      moveProcessingOrder(dragged, destination);
    }
    finishDrag();
  };

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
              disabled={selectedLocked}
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
              disabled={selectedLocked}
            />
            <Button color="error" variant="outlined" disabled={selectedLocked} onClick={deleteSelected}>
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
            workspaceState={workspaceStateFor({ entityWorkspaceStates }, entity.id)}
            selected={selectionIds.includes(entity.id)}
            orderIndex={orderIndex}
            dragging={draggingId === entity.id}
            dropSide={dropTarget?.id === entity.id && draggingId !== entity.id ? dropTarget.side : null}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', entity.id);
              draggingIdRef.current = entity.id;
              dropTargetRef.current = null;
              setDraggingId(entity.id);
              setDropTarget(null);
            }}
            onDragOver={(event, side) => {
              if (!draggingIdRef.current) return;
              event.dataTransfer.dropEffect = 'move';
              const next = { id: entity.id, side };
              dropTargetRef.current = next;
              setDropTarget((current) => current?.id === next.id && current.side === next.side ? current : next);
            }}
            onDrop={(event, side) => {
              event.preventDefault();
              dropProcessingOrder({ id: entity.id, side });
            }}
            onDragEnd={finishDrag}
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

