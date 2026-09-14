export const routes = { architecture: "/", requirements: "/requirements", rag: "/rag" } as const;

/** Only known internal pages are valid post-login destinations. */
export function safeDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://sinapse.invalid");
    if (url.origin !== "https://sinapse.invalid" || !Object.values(routes).some(path => path === url.pathname)) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}

export function navigate(path: string, replace = false) {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function loginDestination() {
  return safeDestination(new URLSearchParams(window.location.search).get("returnTo"));
}
