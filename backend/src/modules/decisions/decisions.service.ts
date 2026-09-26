import { NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { DecisionsRepository } from "./decisions.repository.js";
import {
  createDecisionSchema,
  type ChainNode,
  type DecisionEntityType,
  type DecisionListResponse,
  type DecisionRecord,
  type DecisionRow,
} from "./decisions.types.js";

const LABELS: Record<DecisionEntityType, string> = {
  projeto: "projeto",
  epico: "épico",
  feature: "feature",
  pbi: "PBI",
};

export class DecisionsService {
  constructor(private readonly repository: DecisionsRepository = new DecisionsRepository()) {}

  private async requireChain(tipo: DecisionEntityType, id: string): Promise<ChainNode[]> {
    validateUuid(id, `ID do ${LABELS[tipo]}`);
    const chain = await this.repository.resolveChain(tipo, id);
    if (!chain) throw new NotFoundError(`${LABELS[tipo][0].toUpperCase()}${LABELS[tipo].slice(1)} não encontrado.`);
    return chain;
  }

  private toRecord(row: DecisionRow, chain: ChainNode[], ownId: string): DecisionRecord {
    const origin = chain.find((node) => node.tipo === row.entidade_tipo && node.id === row.entidade_id) as ChainNode;
    return {
      id: row.id,
      titulo: row.titulo,
      contexto: row.contexto,
      decisao: row.decisao,
      justificativa: row.justificativa,
      alternativas: row.alternativas,
      autor: row.autor_id && row.autor_nome ? { id: row.autor_id, nome: row.autor_nome } : null,
      created_at: row.created_at,
      origem: { ...origin, herdada: origin.id !== ownId },
    };
  }

  async list(tipo: DecisionEntityType, id: string): Promise<DecisionListResponse> {
    const chain = await this.requireChain(tipo, id);
    const rows = await this.repository.listForChain(chain);
    const known = new Set(chain.map((node) => `${node.tipo}:${node.id}`));
    const decisoes = rows
      .filter((row) => known.has(`${row.entidade_tipo}:${row.entidade_id}`))
      .map((row) => this.toRecord(row, chain, id));
    return { entidade: chain[chain.length - 1], ancestrais: chain.slice(0, -1), decisoes };
  }

  async create(tipo: DecisionEntityType, id: string, usuarioId: string, body: unknown): Promise<DecisionRecord> {
    const parsed = createDecisionSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError(first?.message ?? "Dados da decisão inválidos.", parsed.error.flatten().fieldErrors);
    }
    const chain = await this.requireChain(tipo, id);
    const row = await this.repository.create({
      entidadeTipo: tipo,
      entidadeId: id,
      usuarioId,
      titulo: parsed.data.titulo,
      contexto: parsed.data.contexto,
      decisao: parsed.data.decisao,
      justificativa: parsed.data.justificativa,
      alternativas: parsed.data.alternativas,
    });
    return this.toRecord(row, chain, id);
  }
}

export const decisionsService = new DecisionsService();
