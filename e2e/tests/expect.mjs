const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 10000);

export function expect(target) {
  const isLocator = typeof target.waitFor === "function";
  return {
    async toBeVisible() {
      if (!isLocator) throw new Error("toBeVisible exige um locator");
      await target.first().waitFor({ state: "visible", timeout: TIMEOUT });
    },
    async toHaveAttribute(name, value) {
      const deadline = Date.now() + TIMEOUT;
      let current = null;
      while (Date.now() < deadline) {
        current = await target.first().getAttribute(name);
        if (current === value) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`atributo ${name}: esperado "${value}", recebido "${current}"`);
    },
  };
}
