import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { BacklogSearchRepository } from "./backlog-search.repository.js";
import { likePatterns, makeSnippet, parseTerms } from "./backlog-search.text.js";
import {
  BACKLOG_SEARCH_STATUSES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  type BacklogSearchItem,
  type BacklogSearchResponse,
  type BacklogSearchRow,
  type SearchPathNode,
} from "./backlog-search.types.js";

export interface ProjectLookup {
  findById(id: string): Promise<{ id: string; status: string } | null>;
}

export interface BacklogSearchInput {
  projetoId: string;
  q?: string;
  status?: string;
  tecnologiaId?: string;
  limit?: string;
}

function buildPath(row: BacklogSearchRow): SearchPathNode[] {
  const path: SearchPathNode[] = [{ tipo: "epico", id: row.epico_id, titulo: row.epico_titulo, codigo: null }];
  if (row.feature_id && row.feature_titulo !== null) {
    path.push({ tipo: "feature", id: row.feature_id, titulo: row.feature_titulo, codigo: null });
  }
  if (row.tipo === "pbi") path.push({ tipo: "pbi", id: row.id, titulo: row.titulo, codigo: row.codigo });
  return path;
}

export class BacklogSearchService {
  constructor(
    private readonly repository: BacklogSearchRepository = new BacklogSearchRepository(),
    private readonly projects: ProjectLookup = new ProjectsRepository(),
  ) {}

  async search(input: BacklogSearchInput): Promise<BacklogSearchResponse> {
    validateUuid(input.projetoId, "ID do projeto");
    const query = (input.q ?? "").replace(/\s+/g, " ").trim();
    if (query.length < MIN_QUERY_LENGTH) throw new ValidationError(`Digite ao menos ${MIN_QUERY_LENGTH} caracteres para buscar.`);
    if (query.length > MAX_QUERY_LENGTH) throw new ValidationError(`A busca pode ter no máximo ${MAX_QUERY_LENGTH} caracteres.`);
    const terms = parseTerms(query);
    if (terms.length === 0) throw new ValidationError(`Digite ao menos ${MIN_QUERY_LENGTH} caracteres para buscar.`);

    if (input.status && !(BACKLOG_SEARCH_STATUSES as readonly string[]).includes(input.status)) {
      throw new ValidationError("Status inválido para o filtro da busca.");
    }
    if (input.tecnologiaId) validateUuid(input.tecnologiaId, "ID da tecnologia");
    const limit = input.limit === undefined ? DEFAULT_LIMIT : Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new ValidationError(`O limite deve ser um inteiro entre 1 e ${MAX_LIMIT}.`);
    }

    if (!(await this.projects.findById(input.projetoId))) throw new NotFoundError("Projeto não encontrado.");

    const rows = await this.repository.search(
      input.projetoId,
      likePatterns(terms),
      { status: input.status || undefined, tecnologiaId: input.tecnologiaId || undefined },
      limit,
    );

    const items: BacklogSearchItem[] = rows.map((row) => {
      const campo = row.titulo_match ? "titulo" : "descricao";
      const source = row.titulo_match ? row.titulo : row.descricao ?? "";
      return {
        tipo: row.tipo,
        id: row.id,
        titulo: row.titulo,
        codigo: row.codigo,
        status: row.status,
        campo,
        trecho: makeSnippet(source, terms, campo === "titulo"),
        caminho: buildPath(row),
        tecnologias: row.tecnologias,
      };
    });

    return {
      projeto_id: input.projetoId,
      termo: query,
      total: rows.length > 0 ? Number(rows[0].total) : 0,
      limite: limit,
      items,
    };
  }
}

export const backlogSearchService = new BacklogSearchService();
