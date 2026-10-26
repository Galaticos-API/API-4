import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {Markdown} from './Markdown';
afterEach(cleanup);
it('mostra trechos escapados literalmente sem criar links ou formatação',()=>{
  render(<Markdown source={'O login exige senha\\. \\[manual\\]\\(https://example.test\\) \\*\\*regra\\*\\*'}/>);
  expect(screen.getByText('O login exige senha. [manual](https://example.test) **regra**')).toBeInTheDocument();
  expect(screen.queryByRole('link')).toBeNull();
});
it('distingue referências entre colchetes de texto comum e preserva links Markdown',()=>{
  render(<Markdown source={'A decisão foi registrada [decision-42]. Consulte [o documento](https://example.test/doc).'} />);
  const citation = screen.getByLabelText('Citação: decision-42');
  expect(citation).toHaveClass('markdown-citation');
  expect(citation).toHaveTextContent('[ref]');
  expect(screen.getByRole('link', { name: 'o documento' })).toHaveAttribute('href', 'https://example.test/doc');
});
