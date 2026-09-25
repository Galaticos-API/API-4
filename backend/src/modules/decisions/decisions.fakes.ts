import { ArchiveConflict } from "../projects/archive.types.js";
import { DecisionsRepository } from "./decisions.repository.js";
import type { ChainNode, CreateDecisionInput, DecisionEntityType, DecisionRow } from "./decisions.types.js";

export const PROJECT = "a0000000-0000-4000-8000-000000000001";
export const EPIC = "a0000000-0000-4000-8000-000000000002";
export const FEATURE = "a0000000-0000-4000-8000-000000000003";
export const PBI = "a0000000-0000-4000-8000-000000000004";
export const OTHER_PBI = "a0000000-0000-4000-8000-000000000009";
export const USER = "b0000000-0000-4000-8000-000000000001";

const CHAIN: ChainNode[] = [
  { tipo: "projeto", id: PROJECT, titulo: "Sinapse", codigo: null },
  { tipo: "epico", id: EPIC, titulo: "Especificar backlog", codigo: null },
  { tipo: "feature", id: FEATURE, titulo: "Decisões", codigo: null },
  { tipo: "pbi", id: PBI, titulo: "Registrar decisão", codigo: "PBI-01.5.1" },
];

export class FakeDecisionsRepository extends DecisionsRepository {
  public rows: DecisionRow[] = [];
  public archived = new Set<string>();
  private sequence = 0;

  constructor() {
    super();
  }

  async resolveChain(tipo: DecisionEntityType, id: string): Promise<ChainNode[] | null> {
    const index = CHAIN.findIndex((node) => node.tipo === tipo && node.id === id);
    return index < 0 ? null : CHAIN.slice(0, index + 1);
  }

  async listForChain(chain: ChainNode[]): Promise<DecisionRow[]> {
    const keys = new Set(chain.map((node) => `${node.tipo}:${node.id}`));
    return this.rows
      .filter((row) => keys.has(`${row.entidade_tipo}:${row.entidade_id}`))
      .sort((left, right) => left.created_at.localeCompare(right.created_at));
  }

  async create(input: CreateDecisionInput): Promise<DecisionRow> {
    if (this.archived.has(input.entidadeId)) throw new ArchiveConflict("Item ou ancestral arquivado está disponível apenas para leitura.");
    this.sequence += 1;
    const row: DecisionRow = {
      id: `d0000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`,
      entidade_tipo: input.entidadeTipo,
      entidade_id: input.entidadeId,
      titulo: input.titulo,
      contexto: input.contexto,
      decisao: input.decisao,
      justificativa: input.justificativa,
      alternativas: input.alternativas,
      autor_id: input.usuarioId,
      autor_nome: "Ana PO",
      created_at: new Date(Date.UTC(2026, 8, 25, 10, this.sequence)).toISOString(),
    };
    this.rows.push(row);
    return row;
  }
}
