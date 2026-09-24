export const routes = {
  landing: "/",
  architecture: "/architecture",
  projects: "/projects",
  requirements: "/requirements",
  knowledge: "/knowledge",
  chat: "/chat",
  rag: "/rag",
  documents: "/documents",
  admin: "/admin",
} as const;

const SEGMENT = "[a-zA-Z0-9_-]+";

export function isProjectPath(path: string) {
  return new RegExp(
    `^/projects(?:/${SEGMENT}(?:/(?:epics/${SEGMENT}(?:/features/${SEGMENT}(?:/pbis/${SEGMENT})?)?|documents)?)?)?$`,
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

const EPIC_NEW = new RegExp(`^/projects/(${SEGMENT})/epics/new$`);
const EPIC_DETAIL = new RegExp(`^/projects/(${SEGMENT})/epics/(${SEGMENT})$`);
const FEATURE_NEW = new RegExp(`^/projects/(${SEGMENT})/epics/(${SEGMENT})/features/new$`);
const FEATURE_DETAIL = new RegExp(`^/projects/(${SEGMENT})/epics/(${SEGMENT})/features/(${SEGMENT})$`);
const PBI_NEW = new RegExp(`^/projects/(${SEGMENT})/epics/(${SEGMENT})/features/(${SEGMENT})/pbis/new$`);
const PBI_DETAIL = new RegExp(`^/projects/(${SEGMENT})/epics/(${SEGMENT})/features/(${SEGMENT})/pbis/(${SEGMENT})$`);

export type BacklogRoute =
  | { screen: "epic-new"; projectId: string }
  | { screen: "epic-detail"; projectId: string; epicId: string }
  | { screen: "feature-new"; projectId: string; epicId: string }
  | { screen: "feature-detail"; projectId: string; epicId: string; featureId: string }
  | { screen: "pbi-new"; projectId: string; epicId: string; featureId: string }
  | { screen: "pbi-detail"; projectId: string; epicId: string; featureId: string; pbiId: string }
  | null;

export function isBacklogPath(pathname: string): boolean {
  return parseBacklogRoute(pathname) !== null;
}

export function parseBacklogRoute(pathname: string): BacklogRoute {
  let match = pathname.match(PBI_NEW);
  if (match) return { screen: "pbi-new", projectId: match[1], epicId: match[2], featureId: match[3] };

  match = pathname.match(PBI_DETAIL);
  if (match) return { screen: "pbi-detail", projectId: match[1], epicId: match[2], featureId: match[3], pbiId: match[4] };

  match = pathname.match(FEATURE_NEW);
  if (match) return { screen: "feature-new", projectId: match[1], epicId: match[2] };

  match = pathname.match(FEATURE_DETAIL);
  if (match) return { screen: "feature-detail", projectId: match[1], epicId: match[2], featureId: match[3] };

  match = pathname.match(EPIC_NEW);
  if (match) return { screen: "epic-new", projectId: match[1] };

  match = pathname.match(EPIC_DETAIL);
  if (match) return { screen: "epic-detail", projectId: match[1], epicId: match[2] };

  return null;
}
