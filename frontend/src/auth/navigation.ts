export const routes = { architecture: "/", projects: "/projects", requirements: "/requirements", knowledge: "/knowledge", chat: "/chat", rag: "/rag" } as const;

const SEGMENT = "[a-zA-Z0-9_-]+";

export function isProjectPath(path: string) {
  return new RegExp(
    `^/projects(?:/${SEGMENT}(?:/epics/${SEGMENT}(?:/features/${SEGMENT}(?:/pbis/${SEGMENT})?)?)?)?$`,
  ).test(path);
}

/** Only known internal pages are valid post-login destinations. */
export function safeDestination(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s\u0000-\u001f]/.test(value)) return "/";
  try {
    const url = new URL(value, "https://sinapse.invalid");
    if (url.origin !== "https://sinapse.invalid" || !(Object.values(routes).some(path => path === url.pathname) || isProjectPath(url.pathname))) return "/";
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
