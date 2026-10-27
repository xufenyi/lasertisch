import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { commitInputOnEnter } from './inputCommit';

afterEach(cleanup);

describe('single-line input commit', () => {
  it('blurs on Enter so the existing blur handler applies the value immediately', () => {
    const apply = vi.fn();
    render(<input aria-label="value" onKeyDown={commitInputOnEnter} onBlur={apply} />);
    const input = screen.getByLabelText('value');
    input.focus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(apply).toHaveBeenCalledOnce();
    expect(document.activeElement).not.toBe(input);
  });

  it('does not commit other keys or an unfinished input-method composition', () => {
    const apply = vi.fn();
    render(<input aria-label="value" onKeyDown={commitInputOnEnter} onBlur={apply} />);
    const input = screen.getByLabelText('value');
    input.focus();
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(apply).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });
});
