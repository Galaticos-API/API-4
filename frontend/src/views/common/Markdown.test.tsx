import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {Markdown} from './Markdown';
afterEach(cleanup);
it('mostra trechos escapados literalmente sem criar links ou formatação',()=>{
  render(<Markdown source={'O login exige senha\\. \\[manual\\]\\(https://example.test\\) \\*\\*regra\\*\\*'}/>);
  expect(screen.getByText('O login exige senha. [manual](https://example.test) **regra**')).toBeInTheDocument();
  expect(screen.queryByRole('link')).toBeNull();
});
