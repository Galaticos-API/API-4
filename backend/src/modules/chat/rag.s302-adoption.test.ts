import test from 'node:test';
import assert from 'node:assert/strict';
import { supportsRequestedDecision } from './rag.service.js';

const decisions: Array<[string, boolean]> = [
  ['A equipe adotou {db} para persistência de dados.', true],
  ['A decisão registrada foi utilizar {db} como banco principal.', true],
  ['{db} é o banco de dados operacional da plataforma.', true],
  ['O banco principal utilizado em produção é {db}.', true],
  ['A plataforma utiliza {db} como banco de dados em produção.', true],
  ['A equipe recomenda adotar {db}.', false],
  ['O cliente pediu para avaliar se deve adotar {db}.', false],
  ['A equipe planeja utilizar {db} no próximo trimestre.', false],
  ['A equipe estuda adotar {db}.', false],
  ['A equipe não adotou {db} em produção.', false],
  ['A equipe utiliza {db} apenas no protótipo.', false],
  ['{db} foi utilizado somente no benchmark.', false],
  ['A equipe adotou {db} para reproduzir um incidente em laboratório.', false],
  ['A equipe adotou {db} porque não exige licença paga.', true],
  ['A equipe adotou {db} para substituir o banco descontinuado.', true],
  ['A equipe decidiu não utilizar {db}.', false],
  ['{db} não é o banco de dados do projeto.', false],
];
for (const db of ['PostgreSQL','MySQL','MariaDB','SQLite','MongoDB','SQL Server','Oracle Database','CockroachDB','Firebird','Db2']) {
  for (const [pattern, expected] of decisions) {
    const quote = pattern.replace('{db}', db);
    test(`S3-02 adoção em produção: ${quote}`, () => {
      assert.equal(supportsRequestedDecision('Qual banco a equipe adotou?', quote), expected);
    });
  }
}
test('S3-02 reconhece DynamoDB como banco adotado em produção', () => {
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'A equipe adotou DynamoDB em produção.'), true);
});

test('S3-02 negação elíptica na sentença seguinte invalida candidato citado antes', () => {
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'PostgreSQL foi usado em produção. A equipe decidiu não adotá-lo.'), false);
});

test('S3-02 decisão afirmativa posterior vence alternativa negada para consulta genérica', () => {
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'PostgreSQL não adotado; MySQL adotado.'), true);
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'PostgreSQL não adotado. MySQL foi adotado.'), true);
});

test('S3-02 uso em benchmark seguido de não adoção não comprova decisão', () => {
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'PostgreSQL foi usado no benchmark, mas não foi adotado.'), false);
});

test('S3-02 adversativa invalida decisão afirmativa anterior', () => {
  for (const connector of ['Porém', 'Contudo']) {
    assert.equal(supportsRequestedDecision('Qual banco foi adotado?', `PostgreSQL foi adotado em produção. ${connector}, não foi escolhido para produção.`), false);
  }
});

test('S3-02 substituição de outro banco não invalida candidato afirmado', () => {
  assert.equal(supportsRequestedDecision('Qual banco foi adotado?', 'PostgreSQL foi adotado. MySQL foi substituído por Oracle Database.'), true);
});
