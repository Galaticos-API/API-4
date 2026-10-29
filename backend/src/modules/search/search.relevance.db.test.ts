import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { SearchRepository } from './search.repository.js';
import { env } from '../../config/env.js';

const url = process.env.ARCHIVE_TEST_DATABASE_URL;
test('busca híbrida: relevância, siglas, números e isolamento', { skip: !url }, async t => {
  assert.match(new URL(url!).pathname, /_test$/);
  const db = new Pool({ connectionString: url });
  const repository = new SearchRepository(db);
  const projects = [randomUUID(), randomUUID()];
  const documents = [randomUUID(), randomUUID()];
  const queryVector = [1, ...Array(1023).fill(0)];
  const search = (query: string) => repository.hybridSearch({ query, projectId: projects[0], limit: 5 }, queryVector, 0.55);
  const seed = async (text: string, similarity: number | null, metadata = {}, scope = 0) => {
    const id = randomUUID();
    const vector = similarity === null ? null : JSON.stringify([similarity, Math.sqrt(1 - similarity ** 2), ...Array(1022).fill(0)]);
    await db.query("INSERT INTO chunk(id,projeto_id,entidade_tipo,entidade_id,texto,metadados_json,embedding) VALUES($1,$2,'documento',$3,$4,$5::jsonb,$6::vector)",
      [id, projects[scope], documents[scope], text, JSON.stringify(metadata), vector]);
    return id;
  };
  const clean = () => db.query('DELETE FROM chunk WHERE projeto_id=ANY($1::uuid[])', [projects]);
  try {
    for (let i = 0; i < projects.length; i++) {
      await db.query("INSERT INTO projeto(id,nome,cliente) VALUES($1,$2,'QA')", [projects[i], 'QA relevância ' + projects[i]]);
      await db.query("INSERT INTO documento(id,projeto_id,nome,caminho,status_processamento) VALUES($1,$2,'qa.txt','qa.txt','processado')", [documents[i], projects[i]]);
    }
    await t.test('uma palavra genérica em comum não basta para incluir um assunto diferente', async () => {
      await clean();
      const expected = await seed('O painel mostra consumo mensal de energia elétrica em gráficos.', 0.68);
      await seed('O sistema apresenta gráficos de produtividade dos técnicos.', 0.575);
      assert.deepEqual((await search('Exibir gráficos de consumo mensal de energia')).map(row => row.id), [expected]);
    });
    await t.test('candidatos descartados não consomem o limite da busca', async () => {
      for (const limit of [1, 5]) {
        await clean();
        for (let i = 0; i < limit; i++) await seed('Gráficos de produtividade dos técnicos.', 0.59);
        const expected = await seed('O consumo mensal de energia elétrica é apresentado no painel.', 0.58);
        const result = await repository.hybridSearch({ query: 'Exibir gráficos de consumo mensal de energia', projectId: projects[0], limit }, queryVector, 0.55);
        assert.deepEqual(result.map(row => row.id), [expected]);
      }
    });
    await t.test('sigla encontra a expressão completa mesmo abaixo do corte vetorial', async () => {
      await clean();
      const expected = await seed('Um plano de metas estratégicas pode ser cadastrado por pessoa e por ano.', 0.49);
      assert.deepEqual((await search('Qual processo registra um PME anual para cada pessoa?')).map(row => row.id), [expected]);
    });
    await t.test('conceitos equivalentes recuperam formulações diferentes com apoio de dois conceitos', async () => {
      await clean();
      const expected = await seed('Autenticação com restrição de funcionalidades para operadores.', 0.46);
      assert.deepEqual((await search('Limitar a entrada de operadores no setor protegido')).map(row => row.id), [expected]);
    });
    await t.test('perguntas em linguagem natural sobre banco recuperam fontes que citam o produto do banco', async () => {
      await clean();
      const expected = await seed('O projeto utiliza PostgreSQL como banco de dados relacional principal.', 0.4);
      await seed('O banco libera crédito para clientes pessoa física.', 0.9);
      for (const query of ['banco', 'banco de dados', 'Qual banco estamos usando?', 'Qual tecnologia de banco de dados foi escolhida?']) {
        assert.ok((await search(query)).some(row => row.id === expected), `Não recuperou a fonte para: ${query}`);
      }
    });
    await t.test('inativação é recuperável como desabilitação de um cadastro', async () => {
      await clean();
      const expected = await seed('Permitir inativação de cadastro funcional.', 0.46);
      assert.deepEqual((await search('Desabilitar o cadastro de um funcionário')).map(row => row.id), [expected]);
    });
    await t.test('o limite configurado para conceitos é respeitado quando supera o corte vetorial', async () => {
      await clean();
      await seed('Inativação de cadastro funcional.', 0.56);
      const previous = env.SEARCH_MIN_CONCEPT_SIMILARITY;
      try {
        env.SEARCH_MIN_CONCEPT_SIMILARITY = 0.9;
        assert.deepEqual(await search('Desabilitar cadastro de pessoa sem apagar seus dados'), []);
      } finally { env.SEARCH_MIN_CONCEPT_SIMILARITY = previous; }
    });
    await t.test('dois termos distintivos permitem correspondência parcial sem exigir a frase inteira', async () => {
      await clean();
      const expected = await seed('As séries descrevem o consumo hídrico por trimestre em uma curva.', 0.52);
      assert.deepEqual((await search('Como observar a evolução do consumo de água em séries trimestrais?')).map(row => row.id), [expected]);
    });
    await t.test('um único conceito equivalente não inclui uma fonte de outro assunto', async () => {
      await clean();
      await seed('Inativação de contas de usuário.', 0.46);
      assert.deepEqual(await search('Desabilitar a exportação do faturamento'), []);
    });
    await t.test('entrada física não é tratada como autenticação', async () => {
      await clean();
      await seed('Login com restrição das funcionalidades para administradores.', 0.52);
      assert.deepEqual(await search('Restringir a entrada de veículos no estacionamento'), []);
      assert.deepEqual(await search('Entrar com caminhões em área restrita do galpão'), []);
    });
    await t.test('repetições e sinônimos do mesmo conceito não contam como conceitos independentes', async () => {
      await clean();
      await seed('Autenticação de contas de usuário.', 0.46);
      assert.deepEqual(await search('Login, autenticação e identificação'), []);
    });
    await t.test('termos comuns a todo o projeto não sustentam uma correspondência parcial', async () => {
      await clean();
      await seed('Análise de documentação sobre parcelas.', 0.52);
      await seed('Análise de documentação sobre segurança.', 0.52);
      assert.deepEqual(await search('Análise de documentação para executar sangria'), []);
    });
    await t.test('expressão completa encontra a sigla da fonte com apoio semântico', async () => {
      await clean();
      const expected = await seed('O RH controla contas e permissões de acesso.', 0.59);
      assert.deepEqual((await search('Como recursos humanos gerencia as credenciais?')).map(row => row.id), [expected]);
    });
    await t.test('algarismos também reconhecem números por extenso', async () => {
      await clean();
      const expected = await seed('Cada estado tem uma nota entre zero e dez, com ordenação.', 0.58);
      assert.deepEqual((await search('Ordenar estados conforme notas de 0 a 10')).map(row => row.id), [expected]);
    });
    await t.test('sinal semântico forte mantém paráfrases com poucas palavras comuns', async () => {
      await clean();
      const expected = await seed('O sistema conserva o histórico anual de capacitação.', 0.625);
      assert.deepEqual((await search('Guardar a evolução profissional de uma pessoa ano a ano')).map(row => row.id), [expected]);
    });
    await t.test('sem correspondência textual, conserva a recuperação puramente semântica', async () => {
      await clean();
      const expected = await seed('Credenciais individuais são necessárias para utilizar a aplicação.', 0.58);
      assert.deepEqual((await search('Exigir autenticação antes de entrar')).map(row => row.id), [expected]);
    });
    await t.test('busca textual continua disponível sem embedding da fonte', async () => {
      await clean();
      const expected = await seed('Consumo mensal de energia elétrica.', null);
      assert.deepEqual((await search('consumo mensal')).map(row => row.id), [expected]);
    });
    await t.test('identificador literal preserva a origem e não aceita fallback semântico', async () => {
      await clean();
      const expected = await seed('Descrição da funcionalidade.', 0, { source_locator: 'REF-312' });
      await seed('Outra funcionalidade.', 1, { source_locator: 'REF-100' });
      assert.deepEqual((await search('REF-312')).map(row => row.id), [expected]);
      assert.deepEqual(await search('REF-999'), []);
    });
    await t.test('similaridade máxima não atravessa projeto nem expõe documento não processado', async () => {
      await clean();
      await seed('Energia elétrica.', 1, {}, 1);
      await seed('Energia elétrica.', 1);
      await db.query("UPDATE documento SET status_processamento='falha' WHERE id=$1", [documents[0]]);
      assert.deepEqual(await search('energia elétrica'), []);
      await db.query("UPDATE documento SET status_processamento='processado' WHERE id=$1", [documents[0]]);
      assert.equal((await search('energia elétrica')).length, 1);
      await db.query("UPDATE projeto SET status='arquivado' WHERE id=$1", [projects[0]]);
      assert.deepEqual(await search('energia elétrica'), []);
    });
  } finally {
    await db.query('DELETE FROM projeto WHERE id=ANY($1::uuid[])', [projects]);
    await db.end();
  }
});
