import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import '../i18n';
import { useEditorStore } from '../state/editorStore';
import { ProjectActions } from './ProjectActions';
import { DEFAULT_PROCESS, type LineEntity } from '../domain/model';

beforeEach(()=>{
  useEditorStore.getState().newProject('Original');
  useEditorStore.setState({clipboard:null,placementSession:null});
});
afterEach(()=>{cleanup();delete window.pywebview;vi.restoreAllMocks();});
function shortcut(key:string,meta=false,repeat=false) {
  const event=new KeyboardEvent('keydown',{key,ctrlKey:!meta,metaKey:meta,repeat,cancelable:true});
  act(()=>window.dispatchEvent(event));return event;
}
describe('project toolbar shortcuts',()=>{
  it.each([false,true])('creates and opens using the advertised shortcuts (Meta=%s)',async meta=>{
    const open=vi.fn(async()=>({status:'cancelled'}));window.pywebview={api:{open_project_file:open}};
    render(<ProjectActions />);const id=useEditorStore.getState().document.documentId;
    expect(shortcut('n',meta).defaultPrevented).toBe(true);
    expect(useEditorStore.getState().document.documentId).not.toBe(id);
    await act(async()=>{expect(shortcut('o',meta).defaultPrevented).toBe(true);});
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:'新建项目'}).getAttribute('aria-keyshortcuts')).toContain('Control+N');
    expect(screen.getByRole('button',{name:'打开'}).getAttribute('aria-keyshortcuts')).toContain('Control+O');
    shortcut('o',meta,true);expect(open).toHaveBeenCalledTimes(1);
  });
  it('keeps the discard confirmation for keyboard and button actions',()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),open=vi.fn();
    window.pywebview={api:{open_project_file:open}};
    useEditorStore.getState().updateProjectName('Unsaved');render(<ProjectActions />);
    const document=useEditorStore.getState().document;
    shortcut('n');shortcut('o');fireEvent.click(screen.getByRole('button',{name:'新建项目'}));
    expect(confirm).toHaveBeenCalledTimes(3);expect(open).not.toHaveBeenCalled();
    expect(useEditorStore.getState().document).toBe(document);
    confirm.mockReturnValue(true);shortcut('n');expect(useEditorStore.getState().document).not.toBe(document);
  });
  it('uses the browser file picker fallback and separates project and clipboard actions',()=>{
    const picker=vi.spyOn(HTMLInputElement.prototype,'click').mockImplementation(()=>{});
    const {container}=render(<ProjectActions />);shortcut('o');expect(picker).toHaveBeenCalledTimes(1);
    const separators=screen.getAllByRole('separator');expect(separators).toHaveLength(3);
    expect(separators[0].compareDocumentPosition(screen.getByRole('button',{name:'新建项目'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separators[1].compareDocumentPosition(screen.getByRole('button',{name:'撤销'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separators[2].compareDocumentPosition(screen.getByRole('button',{name:'复制'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('[role=separator]')).toHaveLength(3);
  });
  it('enables copy, paste and duplicate from editor state and advertises their shortcuts',()=>{
    const line:LineEntity={id:'00000000-0000-0000-0000-000000000111',kind:'line',name:'Line',
      process:DEFAULT_PROCESS,start:{xUm:0,yUm:0},end:{xUm:1000,yUm:0}};
    render(<ProjectActions />);
    expect((screen.getByRole('button',{name:'复制'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button',{name:'粘贴'}) as HTMLButtonElement).disabled).toBe(true);
    act(()=>useEditorStore.getState().addEntity(line));
    const copy=screen.getByRole('button',{name:'复制'}),duplicate=screen.getByRole('button',{name:'重复'});
    expect((copy as HTMLButtonElement).disabled).toBe(false);
    expect((duplicate as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(copy);
    expect((screen.getByRole('button',{name:'粘贴'}) as HTMLButtonElement).disabled).toBe(false);
    expect(copy.getAttribute('aria-keyshortcuts')).toContain('Control+C');
    expect(duplicate.getAttribute('aria-keyshortcuts')).toContain('Meta+D');
  });
});
