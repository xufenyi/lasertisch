import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import '../i18n';
import { useEditorStore } from '../state/editorStore';
import { ProjectActions } from './ProjectActions';

beforeEach(()=>useEditorStore.getState().newProject('Original'));
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
  it('uses the browser file picker fallback and places the only separator before New',()=>{
    const picker=vi.spyOn(HTMLInputElement.prototype,'click').mockImplementation(()=>{});
    const {container}=render(<ProjectActions />);shortcut('o');expect(picker).toHaveBeenCalledTimes(1);
    const separators=screen.getAllByRole('separator');expect(separators).toHaveLength(1);
    expect(separators[0].compareDocumentPosition(screen.getByRole('button',{name:'新建项目'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelectorAll('[role=separator]')).toHaveLength(1);
  });
});
