import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '../i18n';
import type { BooleanResponse } from '../domain/boolean';
import { booleanDocument, booleanFixture } from '../test/booleanFixtures';
import { useEditorStore } from '../state/editorStore';
import { requestBooleanOperation } from '../planning/booleanClient';
import { PropertiesPanel } from './PropertiesPanel';

vi.mock('../planning/booleanClient',async (importOriginal) => ({
  ...await importOriginal<typeof import('../planning/booleanClient')>(), requestBooleanOperation:vi.fn(),
}));
const store=() => useEditorStore.getState();
const calculate=() => fireEvent.click(screen.getByRole('button',{name:'预览结果'}));
async function ready() { await waitFor(() => expect((screen.getByRole('button',{name:'应用运算'}) as HTMLButtonElement).disabled).toBe(false)); }
function changeOperation(label: string) {
  fireEvent.mouseDown(screen.getByLabelText('运算方式'));
  fireEvent.click(screen.getByRole('option',{name:label}));
}
beforeEach(() => {
  store().loadDocument(booleanDocument());
  const f=booleanFixture(); store().setSelection([f.request.operandAId,f.request.operandBId]);
  vi.mocked(requestBooleanOperation).mockReset();
  vi.mocked(requestBooleanOperation).mockImplementation(async (_document,revision,operation,a,b) => ({
    ...booleanFixture(operation,revision).response,requestId:`request-${operation}-${a}-${b}`,
  }));
});
afterEach(cleanup);

describe('boolean preview and application panel', () => {
  it('shows A/B and parameter inheritance and applies a preview as one operation', async () => {
    const original=store().document; render(<PropertiesPanel />);
    expect(screen.getByText('A: 重叠 A')).toBeDefined(); expect(screen.getByText('B: 重叠 B')).toBeDefined();
    expect(screen.getByText(/结果继承 A（重叠 A）/)).toBeDefined();
    calculate(); await ready();
    expect(store().document).toBe(original); expect(store().undoStack).toHaveLength(0);
    fireEvent.click(screen.getByRole('button',{name:'应用运算'}));
    expect(store().document.entities).toHaveLength(7); expect(store().undoStack).toHaveLength(1);
    expect(store().document.entities[0]).toMatchObject({kind:'polygon',process:original.entities[0].process});
  });
  it('swaps ordered operands and requests A minus B with the new parameter source', async () => {
    render(<PropertiesPanel />); fireEvent.click(screen.getByRole('button',{name:'交换 A / B'}));
    changeOperation('减除 A − B'); calculate(); await ready();
    const f=booleanFixture();
    expect(requestBooleanOperation).toHaveBeenLastCalledWith(expect.anything(),expect.any(Number),'difference',
      f.request.operandBId,f.request.operandAId,expect.anything());
    expect(screen.getByText(/结果继承 A（重叠 B）/)).toBeDefined();
    fireEvent.click(screen.getByRole('button',{name:'应用运算'}));
    const result=store().document.entities.find((entity) => entity.kind==='polygon')!;
    expect(result.process.markSpeedUmPerSec).toBe(400_000);
  });
  it('can cancel a preview without changing the document or history', async () => {
    const original=store().document; render(<PropertiesPanel />); calculate(); await ready();
    fireEvent.click(screen.getByRole('button',{name:'取消预览'}));
    expect(store().booleanPreview).toBeNull(); expect(store().document).toBe(original);
    expect(store().undoStack).toHaveLength(0); expect(screen.queryByRole('button',{name:'应用运算'})).toBeNull();
  });
  it('keeps originals when requested and clearly warns that they still participate in machining', async () => {
    render(<PropertiesPanel />); fireEvent.click(screen.getByLabelText('保留原对象'));
    expect(screen.getByText(/原对象仍按原参数参与加工/)).toBeDefined();
    calculate(); await ready(); fireEvent.click(screen.getByRole('button',{name:'应用运算'}));
    expect(store().document.entities).toHaveLength(9);
  });
  it('requires empty-result confirmation and disables applying empty results when keeping originals', async () => {
    const f=booleanFixture('empty'); store().setSelection([f.request.operandAId,f.request.operandBId]);
    vi.mocked(requestBooleanOperation).mockImplementation(async (_d,revision) => booleanFixture('empty',revision).response);
    render(<PropertiesPanel />); calculate();
    await screen.findByText(/结果为空。没有有效的闭合区域/);
    expect((screen.getByRole('button',{name:'应用运算'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('保留原对象'));
    expect(screen.getByText(/无需应用空结果/)).toBeDefined();
    expect((screen.getByRole('button',{name:'应用运算'}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('保留原对象'));
    fireEvent.click(screen.getByLabelText('确认移除这两个原对象（运算结果为空）'));
    await ready(); fireEvent.click(screen.getByRole('button',{name:'应用运算'}));
    expect(store().document.entities).toHaveLength(6); expect(store().undoStack).toHaveLength(1);
  });
  it('ignores a late response after a document change', async () => {
    let resolve!: (value: BooleanResponse) => void;
    vi.mocked(requestBooleanOperation).mockImplementation(() => new Promise((done) => {resolve=done;}));
    render(<PropertiesPanel />); const revision=store().documentRevision; calculate();
    act(() => { store().renameEntity(store().selectionIds[0],'修改后的 A'); });
    await act(async () => { resolve(booleanFixture('union',revision).response); });
    expect(store().booleanPreview).toBeNull(); expect(store().document.entities).toHaveLength(8);
    expect(screen.queryByRole('button',{name:'应用运算'})).toBeNull();
  });
  it('ignores an older operation response after a newer preview is ready', async () => {
    let resolve!: (value: BooleanResponse) => void;
    const revision=store().documentRevision;
    vi.mocked(requestBooleanOperation).mockImplementationOnce(() => new Promise((done) => {resolve=done;}));
    render(<PropertiesPanel />); calculate(); changeOperation('交集'); calculate(); await ready();
    expect(store().booleanPreview?.operation).toBe('intersection');
    await act(async () => {resolve(booleanFixture('union',revision).response);});
    expect(store().booleanPreview?.operation).toBe('intersection');
  });
  it('shows failures without changing source objects', async () => {
    const original=store().document;
    vi.mocked(requestBooleanOperation).mockRejectedValue(new Error('unexpected'));
    render(<PropertiesPanel />); calculate(); await screen.findByText('布尔运算失败，请调整图形后重试');
    expect(store().document).toBe(original); expect(store().booleanPreview).toBeNull();
  });
  it('disables invalid selections containing a line or more than two shapes', () => {
    const document=booleanDocument(), a=document.entities[0];
    const line={id:'00000000-0000-4000-8000-000000000999',name:'Line',kind:'line' as const,visible:true,locked:false,
      process:{...a.process,mode:'contour' as const},start:{xUm:0,yUm:0},end:{xUm:1000,yUm:0}};
    document.entities.push(line);document.processingOrder.push(line.id);
    store().loadDocument(document);store().setSelection([a.id,line.id]);render(<PropertiesPanel />);
    expect(screen.getByText(/线段不能参与布尔运算/)).toBeDefined();
    expect((screen.getByRole('button',{name:'预览结果'}) as HTMLButtonElement).disabled).toBe(true);
    act(() => store().setSelection(document.entities.slice(0,3).map((entity) => entity.id)));
    expect(screen.getByText(/请选择恰好两个闭合对象/)).toBeDefined();
    expect(requestBooleanOperation).not.toHaveBeenCalled();
  });
});
