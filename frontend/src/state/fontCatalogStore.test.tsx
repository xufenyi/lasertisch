import { StrictMode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../../../fixtures/default-font-catalog-v1.json';
import type { FontCatalogResponse } from '../domain/text';
import { requestFontCatalog } from '../planning/textClient';
import { useStartupFontCatalog } from '../planning/useStartupFontCatalog';
import { loadFontCatalog, useFontCatalogStore } from './fontCatalogStore';

vi.mock('../planning/textClient',()=>({requestFontCatalog:vi.fn()}));
const result=catalog as FontCatalogResponse;
beforeEach(()=>{
  useFontCatalogStore.setState({fonts:[],defaultFontId:null,status:'idle'});
  vi.mocked(requestFontCatalog).mockResolvedValue(result);
});
afterEach(()=>{cleanup();delete window.pywebview;vi.clearAllMocks();vi.unstubAllEnvs();});

describe('shared startup font catalog',()=>{
  it('preloads once at startup even with StrictMode and repeated ready events',async()=>{
    renderHook(()=>useStartupFontCatalog(),{wrapper:StrictMode});
    await act(async()=>{await loadFontCatalog();});
    expect(useFontCatalogStore.getState().status).toBe('ready');
    expect(requestFontCatalog).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('pywebviewready'));
    await loadFontCatalog();expect(requestFontCatalog).toHaveBeenCalledTimes(2);
  });
  it('waits for the native bridge when the production page mounts first',async()=>{
    vi.stubEnv('DEV',false);
    renderHook(()=>useStartupFontCatalog());
    expect(requestFontCatalog).not.toHaveBeenCalled();
    window.pywebview={api:{font_catalog:vi.fn()}};
    await act(async()=>{window.dispatchEvent(new Event('pywebviewready'));await loadFontCatalog();});
    expect(useFontCatalogStore.getState().status).toBe('ready');
    expect(requestFontCatalog).toHaveBeenCalledTimes(2);
  });
  it('shares an ongoing scan, exposes bundled fonts early, and ignores skipped-font warnings',async()=>{
    let finish!:(value:FontCatalogResponse)=>void;
    vi.mocked(requestFontCatalog).mockImplementation(async includeSystem=>includeSystem
      ? new Promise(resolve=>{finish=resolve;}) : result);
    const first=loadFontCatalog();expect(loadFontCatalog()).toBe(first);
    await Promise.resolve();
    expect(useFontCatalogStore.getState()).toMatchObject({status:'loading',fonts:result.fonts});
    finish({...result,warnings:[{code:'font.skipped_files',parameters:{count:3}}]});await first;
    expect(useFontCatalogStore.getState().status).toBe('ready');
    expect(requestFontCatalog).toHaveBeenCalledTimes(2);
    vi.mocked(requestFontCatalog).mockResolvedValue(result);
    await loadFontCatalog(true);expect(requestFontCatalog).toHaveBeenCalledTimes(3);
  });
  it('keeps available fonts on failure and refreshes without reloading the default separately',async()=>{
    vi.mocked(requestFontCatalog).mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('offline'));
    await loadFontCatalog();
    expect(useFontCatalogStore.getState()).toMatchObject({status:'error',fonts:result.fonts});
    vi.mocked(requestFontCatalog).mockResolvedValue(result);await loadFontCatalog(true);
    expect(requestFontCatalog).toHaveBeenLastCalledWith(true,true);
    expect(requestFontCatalog).toHaveBeenCalledTimes(3);
    expect(useFontCatalogStore.getState().status).toBe('ready');
  });
});
