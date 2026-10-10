import { Badge } from "../common/ui";

const LABEL: Record<string, string> = {
  "ai-accepted": "Sugestão aceita",
  "ai-edited": "Sugestão editada",
};

export function ProvenanceBadge({ provenance, field }: { provenance: Record<string, string> | undefined; field: string }) {
  const value = provenance?.[field];
  if (value !== "ai-accepted" && value !== "ai-edited") return null;
  return <Badge tone="ai">{LABEL[value]}</Badge>;
}
