export { navigate } from "../auth/navigation";

const SEGMENT = "[a-zA-Z0-9_-]+";

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
