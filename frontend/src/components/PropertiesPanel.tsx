import { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';

import { formatUmAsMillimetres, parseMillimetresToUm } from '../domain/units';
import type { EditableEntity, EntityId, WorkAreaSettings } from '../domain/model';
import { useEditorStore } from '../state/editorStore';
import { GeometryForm } from './GeometryForm';

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

function ObjectListItem({
  entity,
  selected,
  onSelect,
}: {
  entity: EditableEntity;
  selected: boolean;
  onSelect: (event: React.MouseEvent) => void;
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
      secondaryAction={
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
      }
    >
      <ListItemButton component="div" selected={selected} onClick={onSelect} sx={{ pr: 6 }}>
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
              if (event.key === 'Enter') event.currentTarget.querySelector('input')?.blur();
              if (event.key === 'Escape') {
                setDraft(entity.name);
                setEditing(false);
              }
            }}
            onBlur={finishEditing}
          />
        ) : (
          <ListItemText primary={entity.name} secondary={t(`tool.${entity.kind}`)} />
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
  const setSelection = useEditorStore((state) => state.setSelection);
  const updateGrid = useEditorStore((state) => state.updateGrid);
  const deleteSelected = useEditorStore((state) => state.deleteSelected);
  const selected = document.entities
    .filter((entity) => selectionIds.includes(entity.id))
    .map((entity) => transientEntities[entity.id] ?? entity);

  return (
    <Box className="properties-panel">
      <Typography variant="overline" color="text.secondary">
        {t('panel.properties')}
      </Typography>
      <Box sx={{ mt: 1 }}>
        {selected.length === 1 ? (
          <GeometryForm entity={selected[0]} />
        ) : selected.length > 1 ? (
          <Stack spacing={1.5}>
            <Typography>{t('panel.selectionCount', { count: selected.length })}</Typography>
            <Button color="error" variant="outlined" onClick={deleteSelected}>
              {t('common.delete')}
            </Button>
          </Stack>
        ) : (
          <Stack spacing={1.25}>
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
          </Stack>
        )}
      </Box>

      <Divider sx={{ my: 2 }} />
      <Typography variant="overline" color="text.secondary">
        {t('panel.objects')}
      </Typography>
      <List dense disablePadding sx={{ mt: 0.5 }}>
        {document.entities.map((entity) => (
          <ObjectListItem
            key={entity.id}
            entity={entity}
            selected={selectionIds.includes(entity.id)}
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

