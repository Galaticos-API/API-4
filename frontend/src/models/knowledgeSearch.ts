import { isProjectPath } from "./navigation";
import type { KnowledgeHit } from "../api/api_knowledge";

export function searchExcerpt(text: string, query: string, max = 300): string {
  const terms = query.trim().toLocaleLowerCase("pt-BR").split(/\s+/).filter(Boolean);
  const lines = text.split(/\n+/).map(line => line.replace(/^(Título|Descrição|Ator \/ Usuário|Decisões e Racional):\s*/i, "").trim()).filter(Boolean);
  const line = lines.find(line => terms.some(term => line.toLocaleLowerCase("pt-BR").includes(term))) || lines[0] || text;
  const lower = line.toLocaleLowerCase("pt-BR");
  const match = terms.map(term => lower.indexOf(term)).filter(index => index >= 0).sort((a,b) => a-b)[0] ?? 0;
  const start = Math.max(0, match - 70);
  return (start ? "…" : "") + line.slice(start, start + max) + (line.length > start + max ? "…" : "");
}

export function originLink(hit: KnowledgeHit, query: string): string | null {
  if (!hit.source_url?.startsWith("/") || hit.source_url.startsWith("//") || /[\\\s\u0000-\u001f]/.test(hit.source_url)) return null;
  const url = new URL(hit.source_url, "https://sinapse.invalid");
  if (url.origin !== "https://sinapse.invalid" || !isProjectPath(url.pathname)
    || !url.pathname.startsWith("/projects/" + hit.project_id + "/") && url.pathname !== "/projects/" + hit.project_id) return null;
  if (hit.entity_type !== "decisao" && hit.entity_type !== "documento" && !url.pathname.endsWith("/" + hit.entity_id)) return null;
  const hash = hit.entity_type === "decisao" ? "decision-" + hit.entity_id
    : "search-origin=" + encodeURIComponent(searchExcerpt(hit.text, query).replace(/^…|…$/g, ""));
  return url.pathname + "#" + hash;
}
