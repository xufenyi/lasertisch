import { useEffect } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { isPointInWorkArea, isRectangleInWorkArea } from '../domain/geometry';
import type { EditableEntity, LineEntity, RectangleEntity } from '../domain/model';
import {
  formatTenthsDegrees,
  formatUmAsMillimetres,
  parseDegreesToTenths,
  parseMillimetresToUm,
} from '../domain/units';
import { useEditorStore } from '../state/editorStore';

interface GeometryValues {
  x: string;
  y: string;
  width: string;
  height: string;
  angle: string;
  x2: string;
  y2: string;
}

function valuesFor(entity: EditableEntity): GeometryValues {
  if (entity.kind === 'rectangle') {
    return {
      x: formatUmAsMillimetres(entity.center.xUm),
      y: formatUmAsMillimetres(entity.center.yUm),
      width: formatUmAsMillimetres(entity.widthUm),
      height: formatUmAsMillimetres(entity.heightUm),
      angle: formatTenthsDegrees(entity.rotationTenthsDeg),
      x2: '',
      y2: '',
    };
  }
  return {
    x: formatUmAsMillimetres(entity.start.xUm),
    y: formatUmAsMillimetres(entity.start.yUm),
    x2: formatUmAsMillimetres(entity.end.xUm),
    y2: formatUmAsMillimetres(entity.end.yUm),
    width: '',
    height: '',
    angle: '',
  };
}

export function GeometryForm({ entity }: { entity: EditableEntity }) {
  const { t } = useTranslation();
  const replaceEntities = useEditorStore((state) => state.replaceEntities);
  const setStatus = useEditorStore((state) => state.setStatus);
  const workArea = useEditorStore((state) => state.document.workArea);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<GeometryValues>({ defaultValues: valuesFor(entity) });

  useEffect(() => reset(valuesFor(entity)), [entity, reset]);

  const fail = () => {
    setError('x', { message: t('error.invalidValue') });
    setStatus('error.invalidValue');
  };

  const submit = (values: GeometryValues) => {
    try {
      let update: RectangleEntity | LineEntity;
      if (entity.kind === 'rectangle') {
        update = {
          ...entity,
          center: {
            xUm: parseMillimetresToUm(values.x),
            yUm: parseMillimetresToUm(values.y),
          },
          widthUm: parseMillimetresToUm(values.width),
          heightUm: parseMillimetresToUm(values.height),
          rotationTenthsDeg: parseDegreesToTenths(values.angle),
        };
        if (
          update.widthUm <= 0 ||
          update.heightUm <= 0 ||
          !isRectangleInWorkArea(update, workArea)
        ) {
          throw new Error('invalid_rectangle');
        }
      } else {
        update = {
          ...entity,
          start: {
            xUm: parseMillimetresToUm(values.x),
            yUm: parseMillimetresToUm(values.y),
          },
          end: {
            xUm: parseMillimetresToUm(values.x2),
            yUm: parseMillimetresToUm(values.y2),
          },
        };
        if (
          !isPointInWorkArea(update.start, workArea) ||
          !isPointInWorkArea(update.end, workArea) ||
          (update.start.xUm === update.end.xUm && update.start.yUm === update.end.yUm)
        ) {
          throw new Error('invalid_line');
        }
      }
      replaceEntities([update]);
      reset(valuesFor(update));
    } catch {
      fail();
    }
  };

  const field = (name: keyof GeometryValues, label: string) => (
    <TextField
      {...register(name, { required: true })}
      label={label}
      size="small"
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
      fullWidth
    />
  );

  return (
    <Stack
      component="form"
      spacing={1.5}
      onSubmit={handleSubmit(submit)}
      onBlur={() => void handleSubmit(submit)()}
    >
      <Typography variant="subtitle2">{entity.name}</Typography>
      {errors.x && <Alert severity="error">{t('error.invalidValue')}</Alert>}
      {entity.kind === 'rectangle' ? (
        <>
          {field('x', `${t('property.centerX')} (mm)`)}
          {field('y', `${t('property.centerY')} (mm)`)}
          {field('width', `${t('property.width')} (mm)`)}
          {field('height', `${t('property.height')} (mm)`)}
          {field('angle', `${t('property.angle')} (°)`)}
        </>
      ) : (
        <>
          {field('x', `${t('property.startX')} (mm)`)}
          {field('y', `${t('property.startY')} (mm)`)}
          {field('x2', `${t('property.endX')} (mm)`)}
          {field('y2', `${t('property.endY')} (mm)`)}
        </>
      )}
      <Typography variant="caption" color="text.secondary">
        {t('common.autoSave')}
      </Typography>
    </Stack>
  );
}

