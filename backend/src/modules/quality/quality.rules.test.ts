import test from "node:test";
import assert from "node:assert/strict";
import { validarTituloInfinitivo, validarHistoria, validarCenario, identificarTermosVagos } from "./quality.rules.js";

test("PBI-01.3.1 Cenário 1: aceita título em conformidade com verbo no infinitivo", () => {
  const resultado = validarTituloInfinitivo("Consultar solicitação");
  assert.equal(resultado.aprovado, true);
});

test("PBI-01.3.1 Cenário 2: sinaliza título fora do padrão", () => {
  const resultado = validarTituloInfinitivo("Tela de usuários");
  assert.equal(resultado.aprovado, false);
  assert.match(resultado.motivo ?? "", /infinitivo/i);
});

test("validarTituloInfinitivo aceita palavra da lista de exceções configurável", () => {
  const resultado = validarTituloInfinitivo("Onboarding do usuário", ["onboarding"]);
  assert.equal(resultado.aprovado, true);
});

test("PBI-01.3.2 Cenário 1: aprova história com os três blocos preenchidos", () => {
  const resultado = validarHistoria({ comoUm: "Product Owner", euQuero: "cadastrar um item", paraQue: "organizar o backlog" });
  assert.equal(resultado.aprovado, true);
  assert.deepEqual(resultado.alertas, []);
});

test("PBI-01.3.2 Cenário 2: sinaliza especificamente o bloco ausente", () => {
  const resultado = validarHistoria({ comoUm: "Product Owner", euQuero: "cadastrar um item", paraQue: "" });
  assert.equal(resultado.aprovado, false);
  assert.match(resultado.alertas[0], /PARA QUE/);
});

test("PBI-01.3.2 Cenário 3: alerta bloco extenso sem impedir a conclusão", () => {
  const resultado = validarHistoria({ comoUm: "Product Owner", euQuero: "x".repeat(310), paraQue: "organizar o backlog" }, 300);
  assert.equal(resultado.aprovado, true);
  assert.match(resultado.alertas[0], /EU QUERO/);
});

test("PBI-01.3.3 Cenário 1: aprova cenário com DADO/QUANDO/ENTÃO preenchidos", () => {
  const resultado = validarCenario({ dado: "que eu esteja autenticado", quando: "eu confirmar", entao: "o item deve ser criado" });
  assert.equal(resultado.aprovado, true);
});

test("PBI-01.3.3 Cenário 2: sinaliza bloco ausente no cenário", () => {
  const resultado = validarCenario({ dado: "que eu esteja autenticado", quando: "", entao: "o item deve ser criado" });
  assert.equal(resultado.aprovado, false);
  assert.match(resultado.motivo ?? "", /QUANDO/);
});

test("PBI-01.3.4 Cenário 1: destaca termo vago configurado", () => {
  const termos = identificarTermosVagos("o sistema deve ser rápido e intuitivo");
  assert.deepEqual(termos.sort(), ["intuitivo", "rápido"].sort());
});

test("PBI-01.3.4: não sinaliza termos fora da lista configurada", () => {
  const termos = identificarTermosVagos("o sistema deve responder em até dois segundos");
  assert.deepEqual(termos, []);
});

test("identificarTermosVagos respeita lista customizada", () => {
  const termos = identificarTermosVagos("o fluxo deve ser simples", ["simples"]);
  assert.deepEqual(termos, ["simples"]);
});
