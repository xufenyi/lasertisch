import { create } from 'zustand';
import type { FontReference } from '../domain/text';
import { requestFontCatalog } from '../planning/textClient';

interface FontCatalogState {
  fonts: FontReference[];
  defaultFontId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

export const useFontCatalogStore = create<FontCatalogState>(() => ({
  fonts: [], defaultFontId: null, status: 'idle',
}));

let pending: Promise<void> | null = null;

/** Startup, editor and refresh share one catalog and one in-flight scan. */
export function loadFontCatalog(refresh = false): Promise<void> {
  if (pending) return pending;
  if (!refresh && useFontCatalogStore.getState().status === 'ready') return Promise.resolve();
  useFontCatalogStore.setState({ status: 'loading' });
  pending = (async () => {
    try {
      if (!useFontCatalogStore.getState().fonts.length) {
        const bundled = await requestFontCatalog(false);
        if (!bundled.ok) throw new Error('font catalog unavailable');
        useFontCatalogStore.setState({ fonts: bundled.fonts, defaultFontId: bundled.defaultFontId });
      }
      const catalog = await requestFontCatalog(true, refresh);
      if (!catalog.ok) throw new Error('font catalog unavailable');
      // Unreadable/unsupported individual fonts are intentionally skipped silently.
      useFontCatalogStore.setState({ fonts: catalog.fonts, defaultFontId: catalog.defaultFontId, status: 'ready' });
    } catch {
      useFontCatalogStore.setState({ status: 'error' });
    } finally {
      pending = null;
    }
  })();
  return pending;
}
