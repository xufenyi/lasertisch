import type { KeyboardEvent } from 'react';

/** Apply the current single-line input through its existing blur handler. */
export function commitInputOnEnter(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.stopPropagation();
  const current = event.currentTarget;
  const input = current.matches('input, textarea')
    ? current
    : current.querySelector<HTMLElement>('input, textarea');
  input?.blur();
}
