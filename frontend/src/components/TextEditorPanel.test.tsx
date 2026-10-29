import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import '../i18n';
import catalog from '../../../fixtures/default-font-catalog-v1.json';
import snapshots from '../../../fixtures/text-outline-snapshots-v1.json';
import fixture from '../../../fixtures/editable-text-v2.lasertisch.json';
import missing from '../../../fixtures/text-missing-font-v2.lasertisch.json';
import { parseProjectDocument } from '../domain/projectFiles';
import type { FontCatalogResponse,TextOutlineResponse,TextOutlineSnapshot } from '../domain/text';
import type { TextEntity } from '../domain/model';
import { requestFontCatalog,requestTextOutline } from '../planning/textClient';
import { useEditorStore } from '../state/editorStore';
import { loadFontCatalog, useFontCatalogStore } from '../state/fontCatalogStore';
import { PropertiesPanel } from './PropertiesPanel';

vi.mock('../planning/textClient',()=>({requestFontCatalog:vi.fn(),requestTextOutline:vi.fn()}));
const store=()=>useEditorStore.getState();
beforeEach(async()=>{
  vi.mocked(requestFontCatalog).mockResolvedValue(catalog as FontCatalogResponse);
  vi.mocked(requestTextOutline).mockImplementation(async (parameters,revision)=>({apiVersion:1,requestId:catalog.requestId,documentRevision:revision,ok:true,
    snapshot:{...structuredClone(snapshots[0].snapshot),source:{...snapshots[0].snapshot.source,content:parameters.content,
      fontSizeUm:parameters.fontSizeUm ?? 10000,curveToleranceUm:parameters.curveToleranceUm ?? 5,shortSegmentTargetUm:parameters.shortSegmentTargetUm ?? 0}} as TextOutlineSnapshot,errors:[],warnings:[]}));
  store().loadDocument(parseProjectDocument(JSON.stringify(fixture)));
  useFontCatalogStore.setState({fonts:[],defaultFontId:null,status:'idle'});
  await loadFontCatalog();
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
async function beginEdit(){const entity=store().document.entities[0] as TextEntity;store().beginText(entity.position,entity.id);render(<PropertiesPanel />);await waitFor(()=>expect(requestFontCatalog).toHaveBeenCalledTimes(2));}
const preview=()=>fireEvent.click(screen.getByRole('button',{name:'预览轮廓'}));
describe('text editing panel',()=>{
  it('shows startup scan progress only inside text editing, not when just selecting the tool',async()=>{
    useFontCatalogStore.setState({status:'loading'});
    act(()=>store().setTool('text'));render(<PropertiesPanel />);
    expect(screen.queryByText('正在读取系统字体…')).toBeNull();
    const entity=store().document.entities[0] as TextEntity;
    act(()=>store().beginText(entity.position,entity.id));
    expect(screen.getByRole('status').textContent).toBe('正在读取系统字体…');
    act(()=>store().cancelText());
    expect(screen.queryByText('正在读取系统字体…')).toBeNull();
    act(()=>store().beginText(entity.position,entity.id));
    expect(screen.getByRole('status').textContent).toBe('正在读取系统字体…');
    act(()=>useFontCatalogStore.setState({status:'ready'}));
    expect(screen.queryByText('正在读取系统字体…')).toBeNull();
    expect(requestFontCatalog).toHaveBeenCalledTimes(2);
  });
  it('uses the startup catalog without rescanning when entering text editing again',async()=>{
    await beginEdit();
    fireEvent.click(screen.getByRole('button',{name:'取消'}));
    const entity=store().document.entities[0] as TextEntity;
    act(()=>store().beginText(entity.position,entity.id));
    await screen.findByLabelText('单行内容');
    expect(requestFontCatalog).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('正在读取系统字体…')).toBeNull();
  });
  it('previews and applies explicitly; changing parameters clears the prior preview',async()=>{
    await beginEdit();const original=store().document;preview();
    await waitFor(()=>expect(store().textPreview).not.toBeNull());expect(store().document).toBe(original);
    fireEvent.change(screen.getByLabelText('短线段合并目标 (mm)'),{target:{value:'0.2'}});
    expect(store().textPreview).toBeNull();expect((screen.getByRole('button',{name:'应用文字'}) as HTMLButtonElement).disabled).toBe(true);
    preview();await waitFor(()=>expect(store().textPreview).not.toBeNull());
    expect(vi.mocked(requestTextOutline).mock.lastCall?.[0].shortSegmentTargetUm).toBe(200);
    fireEvent.click(screen.getByRole('button',{name:'应用文字'}));
    expect(store().textSession).toBeNull();expect(store().undoStack).toHaveLength(1);
    expect((store().document.entities[0] as TextEntity).text.shortSegmentTargetUm).toBe(200);
  });
  it('ignores a response arriving after an input edit and cancellation',async()=>{
    let resolve!:(response:TextOutlineResponse)=>void;
    vi.mocked(requestTextOutline).mockImplementation(()=>new Promise(done=>{resolve=done;}));
    await beginEdit();preview();fireEvent.change(screen.getByLabelText('单行内容'),{target:{value:'new'}});
    await act(async()=>resolve({apiVersion:1,requestId:catalog.requestId,documentRevision:store().documentRevision,ok:true,snapshot:snapshots[0].snapshot as TextOutlineSnapshot,errors:[],warnings:[]}));
    expect(store().textPreview).toBeNull();fireEvent.click(screen.getByRole('button',{name:'取消'}));
    expect(store().textSession).toBeNull();expect(store().undoStack).toHaveLength(0);
  });
  it('preserves the missing font selection until the user chooses a replacement',async()=>{
    store().loadDocument(parseProjectDocument(JSON.stringify(missing)));await beginEdit();
    await screen.findByText(/原字体不在当前目录中/);
    vi.mocked(requestTextOutline).mockImplementation(async (_,revision)=>({apiVersion:1,requestId:catalog.requestId,documentRevision:revision,ok:false,snapshot:null,errors:[{code:'font.unavailable',parameters:{}}],warnings:[]}));
    preview();await screen.findByText(/所选字体不可用/);
    expect(vi.mocked(requestTextOutline).mock.lastCall?.[0].fontId).toBe('0'.repeat(64)+':0');
    expect(store().textPreview).toBeNull();expect(store().undoStack).toHaveLength(0);
  });
  it('rejects invalid numeric input without sending a conversion request',async()=>{
    await beginEdit();fireEvent.change(screen.getByLabelText('最大轮廓误差 (mm)'),{target:{value:'0'}});preview();
    await screen.findByText(/请输入非空单行文字/);expect(requestTextOutline).not.toHaveBeenCalled();
  });
});
