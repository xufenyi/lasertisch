import type { Tool } from '../domain/model';

export const TOOL_SHORTCUT_KEY: Record<Tool, string> = {
  select: 'V',
  pan: 'H',
  line: 'L',
  rectangle: 'R',
  polygon: 'P',
};

export const FIT_WORK_AREA_SHORTCUT = 'Ctrl/⌘+0';

const TOOL_BY_KEY: Record<string, Tool> = Object.fromEntries(
  Object.entries(TOOL_SHORTCUT_KEY).map(([tool, key]) => [key.toLowerCase(), tool as Tool]),
);

export function toolForShortcut(key: string): Tool | null {
  return TOOL_BY_KEY[key.toLowerCase()] ?? null;
}

export function isFitWorkAreaShortcut(
  key: string,
  ctrlKey: boolean,
  metaKey: boolean,
  altKey: boolean,
): boolean {
  return key === '0' && (ctrlKey || metaKey) && !altKey;
}
