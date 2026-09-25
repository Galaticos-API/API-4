import "@testing-library/jest-dom/vitest";

// Node 26 no Windows não expõe o localStorage do jsdom como global em todas
// as execuções do Vitest. A aplicação usa somente a interface Storage, então
// este fallback mantém o contrato dos testes sem depender do localStorage nativo.
if (typeof globalThis.localStorage === "undefined") {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(String(key), String(value)),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() { return values.size; },
    } satisfies Storage,
  });
}
