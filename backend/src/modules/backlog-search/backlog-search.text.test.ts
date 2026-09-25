import test from "node:test";
import assert from "node:assert/strict";
import { escapeLike, fold, likePatterns, makeSnippet, parseTerms } from "./backlog-search.text.js";

test("fold ignora acentos e maiúsculas sem alterar o tamanho do texto", () => {
  const text = "AÇÃO Rápida do Usuário Ñandú";
  assert.equal(fold(text), "acao rapida do usuario nandu");
  assert.equal(fold(text).length, text.length);
});

test("parseTerms separa palavras, remove duplicadas e termos de 1 caractere, limitando a 6", () => {
  assert.deepEqual(parseTerms("  Autenticação   LOGIN login "), ["autenticacao", "login"]);
  assert.deepEqual(parseTerms("a b c"), []);
  assert.deepEqual(parseTerms("x login"), ["login"]);
  assert.equal(parseTerms("aa bb cc dd ee ff gg hh").length, 6);
});

test("curingas do usuário são tratados como texto literal", () => {
  assert.equal(escapeLike("100%_ok\\"), "100\\%\\_ok\\\\");
  assert.deepEqual(likePatterns(["50%"]), ["%50\\%%"]);
});

test("trecho de título devolve o texto inteiro com todos os destaques", () => {
  const snippet = makeSnippet("Cadastrar usuário no sistema", ["usuario", "sist"], true);
  assert.equal(snippet.texto, "Cadastrar usuário no sistema");
  assert.deepEqual(snippet.destaques, [[10, 17], [21, 25]]);
  assert.equal(snippet.texto.slice(10, 17), "usuário");
});

test("trecho de descrição curta não recebe reticências e junta quebras de linha", () => {
  const snippet = makeSnippet("Como um PO\nEu quero filtrar\nPara localizar", ["filtrar"], false);
  assert.equal(snippet.texto, "Como um PO Eu quero filtrar Para localizar");
  assert.equal(snippet.texto.slice(snippet.destaques[0][0], snippet.destaques[0][1]), "filtrar");
});

test("trecho de descrição longa centraliza o termo, corta em palavras e marca reticências", () => {
  const long = `${"palavra ".repeat(40)}o termo-alvo aparece aqui ${"depois ".repeat(40)}`;
  const snippet = makeSnippet(long, ["termo-alvo"], false);
  assert.ok(snippet.texto.startsWith("…"));
  assert.ok(snippet.texto.endsWith("…"));
  assert.ok(snippet.texto.length < 200);
  const [from, to] = snippet.destaques[0];
  assert.equal(snippet.texto.slice(from, to), "termo-alvo");
});

test("destaques sobrepostos são unidos e ocorrências repetidas são todas marcadas", () => {
  const snippet = makeSnippet("login logins", ["login", "logi"], true);
  assert.deepEqual(snippet.destaques, [[0, 5], [6, 11]]);
});
