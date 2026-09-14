export const routes = { architecture: "/", projects: "/projects", requirements: "/requirements", rag: "/rag" } as const;

export function isProjectPath(path: string) {
  return /^\/projects(?:\/[a-zA-Z0-9_-]+)?$/.test(path);
}

export function navigate(path: string, replace = false) {
  window.history[replace ? "replaceState" : "pushState"](null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
