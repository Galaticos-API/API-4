import test from "node:test";
import assert from "node:assert/strict";

import {
  hashPassword,
  verifyPassword,
} from "./pssword.service.js";

test("deve gerar hash sem armazenar a senha em texto puro", async () => {
  const password = "SenhaSegura123!";

  const hash = await hashPassword(password);

  assert.notEqual(hash, password);
  assert.ok(hash.startsWith("scrypt$v1$"));
  assert.equal(hash.includes(password), false);
});

test("deve validar a senha correta", async () => {
  const password = "SenhaSegura123!";
  const hash = await hashPassword(password);

  const valid = await verifyPassword(password, hash);

  assert.equal(valid, true);
});

test("deve rejeitar senha incorreta", async () => {
  const hash = await hashPassword("SenhaCorreta123!");

  const valid = await verifyPassword("SenhaErrada123!", hash);

  assert.equal(valid, false);
});

test("deve gerar salts diferentes para a mesma senha", async () => {
  const password = "MesmaSenha123!";

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);

  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword(password, secondHash), true);
});

test("deve rejeitar hash inválido sem lançar erro", async () => {
  const valid = await verifyPassword(
    "Senha123!",
    "isso-nao-e-um-hash-valido",
  );

  assert.equal(valid, false);
});