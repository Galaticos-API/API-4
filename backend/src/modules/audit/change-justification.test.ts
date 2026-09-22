import test from "node:test";
import assert from "node:assert/strict";
import { ValidationError } from "../../shared/errors.js";
import { assertChangeJustification } from "./change-justification.js";

test("PBI-01.5.6 Cenário 4: rascunho não exige justificativa mesmo com política obrigatória", () => {
  assert.doesNotThrow(() =>
    assertChangeJustification({
      status: "rascunho",
      justificativa: "",
      obrigatoriaNaOrganizacao: true,
    }),
  );
});

test("PBI-01.5.6 Cenário 3: item concluído sem justificativa é recusado quando a organização exige", () => {
  assert.throws(
    () =>
      assertChangeJustification({
        status: "concluido",
        justificativa: "   ",
        obrigatoriaNaOrganizacao: true,
      }),
    (err: Error) => {
      assert.ok(err instanceof ValidationError);
      const details = (err as ValidationError).details as { campos_faltantes: string[] };
      assert.deepEqual(details.campos_faltantes, ["justificativa"]);
      return true;
    },
  );
});

test("PBI-01.5.6 Cenário 1: item concluído aceita justificativa informada", () => {
  assert.doesNotThrow(() =>
    assertChangeJustification({
      status: "concluido",
      justificativa: "Ajustar o título após revisão do PO",
      obrigatoriaNaOrganizacao: true,
    }),
  );
});

test("PBI-01.5.6 Cenário 3 inverso: organização pode dispensar a obrigatoriedade", () => {
  assert.doesNotThrow(() =>
    assertChangeJustification({
      status: "concluido",
      justificativa: null,
      obrigatoriaNaOrganizacao: false,
    }),
  );
});
