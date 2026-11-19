import { apiRequest, ApiError } from "./api_auth";

export const TECHNOLOGY_CATEGORIES = [
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "database", label: "Banco de dados" },
  { value: "ai", label: "IA" },
  { value: "cloud", label: "Nuvem" },
  { value: "devops", label: "DevOps" },
  { value: "mobile", label: "Mobile" },
  { value: "outros", label: "Outros" },
] as const;

export type TechnologyCategory = (typeof TECHNOLOGY_CATEGORIES)[number]["value"];

export interface TechnologyUsage {
  competencias: number;
  itens: number;
  total: number;
}

export interface Technology {
  id: string;
  nome: string;
  categoria: string | null;
  uso: TechnologyUsage;
}

function parseUsage(value: unknown): TechnologyUsage {
  const usage = (value ?? {}) as Record<string, unknown>;
  const competencias = Number(usage.competencias) || 0;
  const itens = Number(usage.itens) || 0;
  return { competencias, itens, total: Number(usage.total) || competencias + itens };
}

function parseTechnology(value: unknown): Technology | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.nome !== "string") return null;
  return {
    id: item.id,
    nome: item.nome,
    categoria: typeof item.categoria === "string" ? item.categoria : null,
    uso: parseUsage(item.uso),
  };
}

export async function listVocabulary(signal?: AbortSignal): Promise<Technology[]> {
  const response = await apiRequest("/technologies", { signal });
  const data = await response.json();
  if (!Array.isArray(data.items)) throw new Error("Catálogo de tecnologias inválido");
  return data.items.map(parseTechnology).filter((item: Technology | null): item is Technology => item !== null);
}

/** Erro de cadastro que aponta o registro já existente com a mesma grafia normalizada. */
export class TechnologyExistsError extends Error {
  constructor(public readonly existing: Technology, message: string) {
    super(message);
  }
}

/** Erro de remoção que traz a quantidade atual de associações a confirmar. */
export class TechnologyInUseError extends Error {
  constructor(public readonly usage: TechnologyUsage, message: string) {
    super(message);
  }
}

function translateError(error: unknown): never {
  if (error instanceof ApiError) {
    const details = (error.details ?? {}) as { code?: string; error?: string; details?: Record<string, unknown> };
    if (details.code === "TECHNOLOGY_EXISTS") {
      const existing = parseTechnology(details.details?.existente);
      if (existing) throw new TechnologyExistsError(existing, details.error ?? "Tecnologia já cadastrada.");
    }
    if (details.code === "TECHNOLOGY_IN_USE") {
      throw new TechnologyInUseError(parseUsage(details.details?.uso), details.error ?? "Tecnologia em uso.");
    }
    if (details.error) throw new Error(details.error);
  }
  throw error;
}

export async function createTechnology(input: { nome: string; categoria: TechnologyCategory }): Promise<Technology> {
  try {
    const response = await apiRequest("/technologies", { method: "POST", body: JSON.stringify(input) });
    const created = parseTechnology(await response.json());
    if (!created) throw new Error("Resposta de cadastro inválida");
    return created;
  } catch (error) {
    translateError(error);
  }
}

export async function updateTechnology(
  id: string,
  input: { nome?: string; categoria?: TechnologyCategory },
): Promise<Technology> {
  try {
    const response = await apiRequest(`/technologies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    const updated = parseTechnology(await response.json());
    if (!updated) throw new Error("Resposta de atualização inválida");
    return updated;
  } catch (error) {
    translateError(error);
  }
}

export async function removeTechnology(id: string, confirmedAssociations?: number): Promise<TechnologyUsage> {
  const query = confirmedAssociations === undefined ? "" : `?confirmar_associacoes=${confirmedAssociations}`;
  try {
    const response = await apiRequest(`/technologies/${encodeURIComponent(id)}${query}`, { method: "DELETE" });
    const data = await response.json();
    return parseUsage(data.associacoes_removidas);
  } catch (error) {
    translateError(error);
  }
}
