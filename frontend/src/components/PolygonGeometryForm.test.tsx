import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '../i18n';
import polygonProject from '../../../fixtures/polygons-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import { polygonBounds } from '../domain/polygonGeometry';
import type { PolygonEntity } from '../domain/model';
import { useEditorStore } from '../state/editorStore';
import { PolygonGeometryForm } from './PolygonGeometryForm';

function SelectedPolygon() {
  const entity = useEditorStore((state) => state.document.entities[2]) as PolygonEntity;
  return <PolygonGeometryForm entity={entity} />;
}

beforeEach(() => {
  useEditorStore.getState().loadDocument(parseProjectDocument(JSON.stringify(polygonProject)));
});
afterEach(cleanup);

describe('polygon property editing', () => {
  it('edits position and angle and records one reversible operation per change', () => {
    render(<SelectedPolygon />);
    const position = screen.getByLabelText('参考点 X (mm)');
    position.focus();
    fireEvent.change(position, { target: { value: '-40.001' } });
    fireEvent.keyDown(position, { key: 'Enter' });
    expect((useEditorStore.getState().document.entities[2] as PolygonEntity).position.xUm).toBe(-40_001);
    expect(useEditorStore.getState().undoStack).toHaveLength(1);
    const angle = screen.getByLabelText('角度 (°)');
    angle.focus();
    fireEvent.change(angle, { target: { value: '90' } });
    fireEvent.keyDown(angle, { key: 'Enter' });
    expect((useEditorStore.getState().document.entities[2] as PolygonEntity).rotationTenthsDeg).toBe(900);
    expect(useEditorStore.getState().undoStack).toHaveLength(2);
  });

  it('edits width independently and scales holes together with the exterior', () => {
    render(<SelectedPolygon />);
    const width = screen.getByLabelText('局部宽度 (mm)');
    width.focus();
    fireEvent.change(width, { target: { value: '22' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    const entity = useEditorStore.getState().document.entities[2] as PolygonEntity;
    expect(polygonBounds(entity)).toMatchObject({ widthUm:22_000, heightUm:40_000 });
    expect(entity.parts[0].holes[0][0]).toEqual({ xUm:-4500, yUm:-8000 });
  });

  it('keeps the document unchanged when an edit is out of bounds', () => {
    render(<SelectedPolygon />);
    const original = useEditorStore.getState().document;
    const position = screen.getByLabelText('参考点 X (mm)');
    position.focus();
    fireEvent.change(position, { target: { value: '95' } });
    fireEvent.keyDown(position, { key: 'Enter' });
    expect(useEditorStore.getState().document).toBe(original);
    expect(useEditorStore.getState().undoStack).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toContain('超出工作区');
  });
});
