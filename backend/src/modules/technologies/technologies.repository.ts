import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { auditService } from "../audit/audit.service.js";
import { AppError, ConflictError, NotFoundError } from "../../shared/errors.js";
import type {
  CreateTechnologyInput,
  Technology,
  TechnologyUsage,
  UpdateTechnologyInput,
} from "./technologies.types.js";

interface TechnologyRow {
  id: string;
  nome: string;
  categoria: string | null;
  competencias: number | string;
  itens: number | string;
}

const SELECT_WITH_USAGE = `
  SELECT
    t.id,
    t.nome,
    t.categoria,
    (SELECT COUNT(*) FROM competencia c WHERE c.tecnologia_id = t.id)::int AS competencias,
    (SELECT COUNT(*) FROM entidade_tecnologia et WHERE et.tecnologia_id = t.id)::int AS itens
  FROM tecnologia t
`;

function toTechnology(row: TechnologyRow): Technology {
  const competencias = Number(row.competencias) || 0;
  const itens = Number(row.itens) || 0;
  return {
    id: row.id,
    nome: row.nome,
    categoria: row.categoria,
    uso: { competencias, itens, total: competencias + itens },
  };
}

export class TechnologyExistsError extends AppError {
  constructor(existing: Technology) {
    super(
      `Já existe a tecnologia "${existing.nome}" com a mesma grafia normalizada. Utilize o registro existente.`,
      409,
      "TECHNOLOGY_EXISTS",
      { existente: existing },
    );
    this.name = "TechnologyExistsError";
  }
}

export class TechnologyInUseError extends AppError {
  constructor(technology: Technology) {
    super(
      `A tecnologia "${technology.nome}" possui ${technology.uso.total} associação(ões): ` +
        `${technology.uso.competencias} competência(s) e ${technology.uso.itens} item(ns) de trabalho. ` +
        "Confirme a remoção informando a quantidade de associações.",
      409,
      "TECHNOLOGY_IN_USE",
      { tecnologia: technology, uso: technology.uso },
    );
    this.name = "TechnologyInUseError";
  }
}

export class TechnologiesRepository {
  constructor(private readonly db: Pick<Pool, "query"> = pool) {}

  async list(search?: string): Promise<Technology[]> {
    const term = search?.trim();
    const { rows } = term
      ? await this.db.query<TechnologyRow>(
          `${SELECT_WITH_USAGE}
           WHERE normalizar_nome_tecnologia(t.nome) LIKE '%' || normalizar_nome_tecnologia($1) || '%'
              OR t.nome ILIKE '%' || $1 || '%'
           ORDER BY t.nome ASC, t.id ASC`,
          [term],
        )
      : await this.db.query<TechnologyRow>(`${SELECT_WITH_USAGE} ORDER BY t.nome ASC, t.id ASC`);
    return rows.map(toTechnology);
  }

  async findById(id: string, client?: Pick<PoolClient, "query">): Promise<Technology | null> {
    const { rows } = await (client ?? this.db).query<TechnologyRow>(
      `${SELECT_WITH_USAGE} WHERE t.id = $1`,
      [id],
    );
    return rows[0] ? toTechnology(rows[0]) : null;
  }

  private async findByNormalizedName(
    client: Pick<PoolClient, "query">,
    nome: string,
    ignoreId?: string,
  ): Promise<Technology | null> {
    const { rows } = await client.query<TechnologyRow>(
      `${SELECT_WITH_USAGE}
       WHERE normalizar_nome_tecnologia(t.nome) = normalizar_nome_tecnologia($1)
         AND ($2::uuid IS NULL OR t.id <> $2::uuid)`,
      [nome, ignoreId ?? null],
    );
    return rows[0] ? toTechnology(rows[0]) : null;
  }

  async create(input: CreateTechnologyInput, actorUserId: string): Promise<Technology> {
    return withTransaction(this.db as Pool, async (client) => {
      const existing = await this.findByNormalizedName(client, input.nome);
      if (existing) throw new TechnologyExistsError(existing);

      let createdId: string;
      try {
        const { rows } = await client.query<{ id: string }>(
          "INSERT INTO tecnologia (nome, categoria) VALUES ($1, $2) RETURNING id",
          [input.nome, input.categoria],
        );
        createdId = rows[0]!.id;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          // Outra pessoa cadastrou a mesma tecnologia entre a checagem e a inserção.
          throw new ConflictError("A tecnologia acabou de ser cadastrada por outra pessoa. Recarregue a lista e utilize o registro existente.");
        }
        throw error;
      }

      const created = (await this.findById(createdId, client))!;
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "tecnologia",
          entidade_id: created.id,
          acao: "CRIAR_TECNOLOGIA",
          dados_json: { nome: created.nome, categoria: created.categoria },
        },
        client,
      );
      return created;
    });
  }

  async update(id: string, input: UpdateTechnologyInput, actorUserId: string): Promise<Technology> {
    return withTransaction(this.db as Pool, async (client) => {
      const { rows: locked } = await client.query<{ id: string }>(
        "SELECT id FROM tecnologia WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!locked[0]) throw new NotFoundError("Tecnologia não encontrada.");
      const before = (await this.findById(id, client))!;

      if (input.nome !== undefined) {
        const existing = await this.findByNormalizedName(client, input.nome, id);
        if (existing) throw new TechnologyExistsError(existing);
      }

      try {
        await client.query(
          `UPDATE tecnologia
           SET nome = COALESCE($2, nome),
               categoria = COALESCE($3, categoria),
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id, input.nome ?? null, input.categoria ?? null],
        );
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new ConflictError("Outra tecnologia com a mesma grafia acabou de ser cadastrada. Recarregue a lista.");
        }
        throw error;
      }

      const updated = (await this.findById(id, client))!;
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "tecnologia",
          entidade_id: id,
          acao: "ATUALIZAR_TECNOLOGIA",
          dados_json: {
            antes: { nome: before.nome, categoria: before.categoria },
            depois: { nome: updated.nome, categoria: updated.categoria },
          },
        },
        client,
      );
      return updated;
    });
  }

  /**
   * Remove a tecnologia. Se houver associações, exige que o solicitante confirme exatamente a
   * quantidade atual: assim uma associação criada depois da tela ter sido aberta não é apagada
   * sem que a pessoa veja o número novo.
   */
  async remove(
    id: string,
    confirmedAssociations: number | undefined,
    actorUserId: string,
  ): Promise<TechnologyUsage> {
    return withTransaction(this.db as Pool, async (client) => {
      const { rows: locked } = await client.query<{ id: string }>(
        "SELECT id FROM tecnologia WHERE id = $1 FOR UPDATE",
        [id],
      );
      if (!locked[0]) throw new NotFoundError("Tecnologia não encontrada.");
      const technology = (await this.findById(id, client))!;

      if (technology.uso.total > 0 && confirmedAssociations !== technology.uso.total) {
        throw new TechnologyInUseError(technology);
      }

      // competencia e entidade_tecnologia usam ON DELETE CASCADE; os gatilhos de 019
      // reenfileiram a reindexação dos itens que perderam a classificação.
      await client.query("DELETE FROM tecnologia WHERE id = $1", [id]);
      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "tecnologia",
          entidade_id: id,
          acao: "REMOVER_TECNOLOGIA",
          dados_json: {
            nome: technology.nome,
            categoria: technology.categoria,
            associacoes_removidas: technology.uso,
          },
        },
        client,
      );
      return technology.uso;
    });
  }
}
