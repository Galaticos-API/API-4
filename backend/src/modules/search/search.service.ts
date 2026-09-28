import { ValidationError, validateUuid } from "../../shared/errors.js";
import { SearchRepository } from "./search.repository.js";

function optionalText(value: unknown, field: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") throw new ValidationError(field + " deve ser um texto.");
  return value.trim();
}

export class SearchService {
  constructor(private readonly repository: Pick<SearchRepository, "search"> = new SearchRepository()) {}

  search(input: Record<string, unknown>, userId: string) {
    const query = optionalText(input.q, "A busca");
    const projectId = optionalText(input.projeto_id, "ID do projeto") || optionalText(input.projectId, "ID do projeto");
    if (projectId) validateUuid(projectId, "ID do projeto");
    if (query.length > 200) throw new ValidationError("A busca pode ter no máximo 200 caracteres.");
    return this.repository.search({ userId, query, projectId: projectId || undefined });
  }
}
