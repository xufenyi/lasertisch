import {cleanup,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import '../i18n';
import { EditorToolbar } from './EditorToolbar';

afterEach(cleanup);
it('keeps the five drawing tools in one group in the requested order',()=>{
  render(<EditorToolbar onFit={vi.fn()} />);
  const group=screen.getByRole('group',{name:'drawing tool'});
  expect(within(group).getAllByRole('button').map(button=>button.getAttribute('aria-label')))
    .toEqual(['线段','矩形','椭圆','多边形','文字']);
});
