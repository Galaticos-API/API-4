import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isClearlyOutsideKnowledge, supportsRequestedDecision, splitCompoundQuestion} from './rag.service.js';

const cases = JSON.parse(readFileSync('src/modules/chat/rag.s302-audit150.json', 'utf8')) as Array<{
  area: string; input: string; expected: boolean | number;
}>;
assert.equal(cases.length, 150);
for (const {area,input,expected} of cases) {
  test(`S3-02 auditoria ${area}: ${input}`, () => {
    const actual = area === 'Evidência' ? supportsRequestedDecision('Qual banco a equipe adotou?', input)
      : area === 'Composta' ? splitCompoundQuestion(input).length : isClearlyOutsideKnowledge(input);
    assert.equal(actual, expected);
  });
}
