import test from "node:test";
import assert from "node:assert/strict";
import { GREETING_REPLY, isGreetingOnly } from "./greetings.js";

test("reconhece saudações isoladas com variações de caixa, acento e pontuação", () => {
  for (const message of ["oi", "Oi!", "OLÁ 😊", "opa", "e aí?", "eae", "salve", "fala aí", "hey", "hello", "bom dia", "Boa tarde!", "boa noite.", "tudo bem?", "tudo bom", "como você está?", "prazer", "valeu", "tchau"]) {
    assert.equal(isGreetingOnly(message), true, message);
  }
  assert.match(GREETING_REPLY, /assistente Sinapse/);
});

test("reconhece erros comuns e repetição casual de letras em saudações", () => {
  for (const message of ["oii", "ooi", "oiiii", "oie", "olaa", "eaii", "bom diaa", "boa tardee", "boa noitee", "tudu bem", "tudo beem", "com vai"]) {
    assert.equal(isGreetingOnly(message), true, message);
  }
});

test("não classifica perguntas ou mensagens com conteúdo adicional como saudação isolada", () => {
  for (const message of [
    "oi, qual é o prazo?",
    "bom dia, quais decisões foram tomadas?",
    "oi equipe",
    "como vai o projeto?",
    "qual é o status?",
  ]) {
    assert.equal(isGreetingOnly(message), false, message);
  }
});
