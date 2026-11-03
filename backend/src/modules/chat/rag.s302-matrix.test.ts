import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {isClearlyOutsideKnowledge as outside,supportsRequestedDecision as supports,splitCompoundQuestion as split} from './rag.service.js';

const cases = JSON.parse(readFileSync('src/modules/chat/rag.s302-cases.json', 'utf8')) as Array<{
  group: string; input: string; expected: boolean | string[];
}>;
assert.equal(cases.length, 250);
for (const {group,input,expected} of cases) {
  test(`S3-02 ${group}: ${input}`, () => {
    const actual = group === 'Evidência de adoção' ? supports('Qual banco foi adotado?', input)
      : group === 'Pergunta composta' ? split(input) : outside(input);
    assert.deepEqual(actual, expected);
  });
}
