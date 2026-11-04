export type EditShortcut = 'copy' | 'paste' | 'duplicate';

export function editShortcutFor(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
  shiftKey: boolean,
): EditShortcut | null {
  if (!(ctrlKey || metaKey) || altKey || shiftKey) return null;
  const byKey: Record<string, EditShortcut> = {
    c: 'copy',
    v: 'paste',
    d: 'duplicate',
  };
  return byKey[key.toLowerCase()] ?? null;
}
