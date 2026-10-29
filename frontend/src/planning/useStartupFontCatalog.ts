import { useEffect } from 'react';
import { loadFontCatalog } from '../state/fontCatalogStore';

export function useStartupFontCatalog() {
  useEffect(() => {
    const preload = () => { void loadFontCatalog(); };
    // The production page can mount before pywebview injects its API.
    // Wait for that event instead of failing a request before the bridge exists.
    window.addEventListener('pywebviewready', preload);
    if (window.pywebview?.api?.font_catalog || import.meta.env.DEV) preload();
    return () => window.removeEventListener('pywebviewready', preload);
  }, []);
}
