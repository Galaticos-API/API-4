import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import { AppError, NotFoundError } from "../../shared/errors.js";
import { auditService } from "../audit/audit.service.js";
import { projectAccessSql } from "../projects/project-access.js";
import type {
  Competency,
  CreateDeveloperInput,
  Developer,
  DeveloperAllocation,
  DeveloperConsolidatedProfile,
  DeveloperHistoryItem,
  DeveloperTechnology,
  LinkablePlatformUser,
  UpdateDeveloperInput,
} from "./developers.types.js";

type Queryable = Pick<Pool, "query" | "connect">;

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return new Date(value).toISOString();
  return new Date().toISOString();
}

function normalizeDeveloperRow(row: Record<string, any>): Developer {
  return {
    id: String(row.id),
    nome: String(row.nome ?? row.usuario_nome ?? "Profissional"),
    senioridade: row.senioridade ?? null,
    bio: row.bio ?? null,
    usuario_id: row.usuario_id ?? null,
    usuario_nome: row.usuario_nome ?? null,
    role: row.role ?? null,
    competencias_count: Number(row.competencias_count ?? 0),
    alocacoes_count: Number(row.alocacoes_count ?? 0),
    created_at: toIsoString(row.created_at),
    updated_at: toIsoString(row.updated_at ?? row.created_at),
  };
}

export class DevelopersRepository {
  constructor(private readonly db: Queryable = pool) {}

  async listDevelopers(viewerUserId?: string): Promise<Developer[]> {
    const allocationCountSql = viewerUserId
      ? `(SELECT COUNT(*)::int FROM alocacao a JOIN projeto p ON p.id = a.projeto_id WHERE a.desenvolvedor_id = d.id AND p.status <> 'arquivado' AND ${projectAccessSql("p.id", "$1")})`
      : `(SELECT COUNT(*)::int FROM alocacao a JOIN projeto p ON p.id = a.projeto_id WHERE a.desenvolvedor_id = d.id AND p.status <> 'arquivado')`;

    const params = viewerUserId ? [viewerUserId] : [];
    const { rows } = await this.db.query(
      `SELECT
         d.id,
         COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
         d.senioridade,
         d.bio,
         d.usuario_id,
         u.nome AS usuario_nome,
         u.role,
         (SELECT COUNT(*)::int FROM competencia c WHERE c.desenvolvedor_id = d.id) AS competencias_count,
         ${allocationCountSql} AS alocacoes_count,
         d.created_at,
         COALESCE(d.updated_at, d.created_at) AS updated_at
       FROM desenvolvedor d
       LEFT JOIN usuario u ON d.usuario_id = u.id
       ORDER BY COALESCE(NULLIF(btrim(d.nome), ''), u.nome) ASC, d.id ASC`,
      params,
    );
    return rows.map(normalizeDeveloperRow);
  }

  async listTechnologies(): Promise<DeveloperTechnology[]> {
    const { rows } = await this.db.query<DeveloperTechnology>(
      "SELECT id, nome, categoria FROM tecnologia ORDER BY nome ASC, id ASC",
    );
    return rows;
  }

  async listCompetencies(): Promise<Competency[]> {
    const { rows } = await this.db.query<Competency>(
      `SELECT c.id, c.desenvolvedor_id, c.tecnologia_id, c.nivel, c.evidencia,
              t.nome AS tecnologia_nome, t.categoria AS tecnologia_categoria
       FROM competencia c
       JOIN tecnologia t ON c.tecnologia_id = t.id
       ORDER BY t.nome ASC, c.id ASC`,
    );
    return rows;
  }

  async listLinkableUsers(): Promise<LinkablePlatformUser[]> {
    const { rows } = await this.db.query<LinkablePlatformUser>(
      `SELECT u.id, u.nome, u.role, d.id AS perfil_id
       FROM usuario u
       LEFT JOIN desenvolvedor d ON d.usuario_id = u.id
       WHERE u.ativo = TRUE
       ORDER BY u.nome ASC, u.id ASC`,
    );
    return rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      role: row.role,
      perfil_id: row.perfil_id ?? null,
    }));
  }

  async findByUsuarioId(
    usuarioId: string,
    executor: Pick<PoolClient, "query"> = this.db,
  ): Promise<Developer | null> {
    const { rows } = await executor.query(
      `SELECT
         d.id,
         COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
         d.senioridade,
         d.bio,
         d.usuario_id,
         u.nome AS usuario_nome,
         u.role,
         (SELECT COUNT(*)::int FROM competencia c WHERE c.desenvolvedor_id = d.id) AS competencias_count,
         (SELECT COUNT(*)::int FROM alocacao a WHERE a.desenvolvedor_id = d.id) AS alocacoes_count,
         d.created_at,
         COALESCE(d.updated_at, d.created_at) AS updated_at
       FROM desenvolvedor d
       LEFT JOIN usuario u ON d.usuario_id = u.id
       WHERE d.usuario_id = $1
       LIMIT 1`,
      [usuarioId],
    );
    return rows[0] ? normalizeDeveloperRow(rows[0]) : null;
  }

  async getConsolidatedProfile(
    developerId: string,
    viewerUserId: string,
  ): Promise<DeveloperConsolidatedProfile | null> {
    const devRes = await this.db.query(
      `SELECT
         d.id,
         COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
         d.senioridade,
         d.bio,
         d.usuario_id,
         u.nome AS usuario_nome,
         u.role,
         d.created_at,
         COALESCE(d.updated_at, d.created_at) AS updated_at
       FROM desenvolvedor d
       LEFT JOIN usuario u ON d.usuario_id = u.id
       WHERE d.id = $1`,
      [developerId],
    );

    const devRow = devRes.rows[0];
    if (!devRow) return null;

    const [competenciasRes, alocacoesRes, projectTechsRes] = await Promise.all([
      this.db.query<Competency>(
        `SELECT
           c.id,
           c.desenvolvedor_id,
           c.tecnologia_id,
           c.nivel,
           c.evidencia,
           t.nome AS tecnologia_nome,
           t.categoria AS tecnologia_categoria
         FROM competencia c
         JOIN tecnologia t ON t.id = c.tecnologia_id
         WHERE c.desenvolvedor_id = $1
         ORDER BY t.nome ASC, c.id ASC`,
        [developerId],
      ),
      this.db.query(
        `SELECT
           a.id,
           a.desenvolvedor_id,
           a.projeto_id,
           p.nome AS projeto_nome,
           p.descricao AS projeto_descricao,
           p.status AS projeto_status,
           a.papel,
           a.data_inicio,
           a.data_fim,
           (a.data_fim IS NULL OR a.data_fim > CURRENT_TIMESTAMP) AS em_andamento
         FROM alocacao a
         JOIN projeto p ON p.id = a.projeto_id
         WHERE a.desenvolvedor_id = $1
           AND p.status <> 'arquivado'
           AND ${projectAccessSql("p.id", "$2")}
         ORDER BY (a.data_fim IS NULL OR a.data_fim > CURRENT_TIMESTAMP) DESC,
                  a.data_inicio DESC,
                  a.id ASC`,
        [developerId, viewerUserId],
      ),
      this.db.query<{
        projeto_id: string;
        id: string;
        nome: string;
        categoria: string | null;
      }>(
        `SELECT DISTINCT
           p.id AS projeto_id,
           t.id,
           t.nome,
           t.categoria
         FROM alocacao a
         JOIN projeto p ON p.id = a.projeto_id
         JOIN entidade_tecnologia et ON (
           (et.entidade_tipo = 'projeto' AND et.entidade_id = p.id)
           OR (et.entidade_tipo = 'epico' AND et.entidade_id IN (SELECT e.id FROM epico e WHERE e.projeto_id = p.id AND e.status <> 'arquivado'))
           OR (et.entidade_tipo = 'feature' AND et.entidade_id IN (
             SELECT f.id FROM feature f JOIN epico e ON e.id = f.epico_id
             WHERE e.projeto_id = p.id AND e.status <> 'arquivado' AND f.status <> 'arquivado'
           ))
           OR (et.entidade_tipo = 'pbi' AND et.entidade_id IN (
             SELECT b.id FROM pbi b JOIN feature f ON f.id = b.feature_id JOIN epico e ON e.id = f.epico_id
             WHERE e.projeto_id = p.id AND e.status <> 'arquivado' AND f.status <> 'arquivado' AND b.status <> 'arquivado'
           ))
         )
         JOIN tecnologia t ON t.id = et.tecnologia_id
         WHERE a.desenvolvedor_id = $1
           AND p.status <> 'arquivado'
           AND ${projectAccessSql("p.id", "$2")}
         ORDER BY t.nome ASC`,
        [developerId, viewerUserId],
      ),
    ]);

    const alocacoes: DeveloperAllocation[] = alocacoesRes.rows.map((row) => ({
      id: String(row.id),
      desenvolvedor_id: String(row.desenvolvedor_id),
      projeto_id: String(row.projeto_id),
      projeto_nome: String(row.projeto_nome),
      projeto_status: String(row.projeto_status),
      papel: row.papel ?? null,
      data_inicio: toIsoString(row.data_inicio),
      data_fim: row.data_fim ? toIsoString(row.data_fim) : null,
      em_andamento: Boolean(row.em_andamento),
    }));

    const techsByProject = new Map<string, DeveloperTechnology[]>();
    for (const row of projectTechsRes.rows) {
      const list = techsByProject.get(row.projeto_id) ?? [];
      list.push({
        id: row.id,
        nome: row.nome,
        categoria: row.categoria ?? null,
      });
      techsByProject.set(row.projeto_id, list);
    }

    const historyByProject = new Map<string, DeveloperHistoryItem>();
    for (const row of alocacoesRes.rows) {
      const projectId = String(row.projeto_id);
      const startIso = toIsoString(row.data_inicio);
      const endIso = row.data_fim ? toIsoString(row.data_fim) : null;
      const role = typeof row.papel === "string" && row.papel.trim() ? row.papel.trim() : null;
      const existing = historyByProject.get(projectId);

      if (!existing) {
        historyByProject.set(projectId, {
          projeto_id: projectId,
          projeto_nome: String(row.projeto_nome),
          projeto_descricao: row.projeto_descricao ?? null,
          projeto_status: String(row.projeto_status),
          papeis: role ? [role] : [],
          primeira_alocacao: startIso,
          ultima_alocacao: endIso,
          em_andamento: Boolean(row.em_andamento),
          tecnologias: techsByProject.get(projectId) ?? [],
        });
      } else {
        if (role && !existing.papeis.includes(role)) {
          existing.papeis.push(role);
        }
        if (startIso < existing.primeira_alocacao) {
          existing.primeira_alocacao = startIso;
        }
        if (row.em_andamento) {
          existing.em_andamento = true;
          existing.ultima_alocacao = null;
        } else if (!existing.em_andamento && endIso && (!existing.ultima_alocacao || endIso > existing.ultima_alocacao)) {
          existing.ultima_alocacao = endIso;
        }
      }
    }

    return {
      id: String(devRow.id),
      nome: String(devRow.nome ?? devRow.usuario_nome ?? "Profissional"),
      senioridade: devRow.senioridade ?? null,
      bio: devRow.bio ?? null,
      usuario_id: devRow.usuario_id ?? null,
      usuario_nome: devRow.usuario_nome ?? null,
      role: devRow.role ?? null,
      created_at: toIsoString(devRow.created_at),
      updated_at: toIsoString(devRow.updated_at),
      competencias: competenciasRes.rows,
      alocacoes,
      historico_consolidado: Array.from(historyByProject.values()),
    };
  }

  private async resolveLinkedUser(
    client: PoolClient,
    usuarioId: string,
    excludeDeveloperId?: string,
  ): Promise<{ id: string; nome: string }> {
    const userRes = await client.query<{ id: string; nome: string; ativo: boolean }>(
      "SELECT id, nome, ativo FROM usuario WHERE id = $1 FOR UPDATE",
      [usuarioId],
    );
    const user = userRes.rows[0];
    if (!user || !user.ativo) {
      throw new NotFoundError("Usuário da plataforma não encontrado ou inativo.");
    }

    const existingProfile = await this.findByUsuarioId(usuarioId, client);
    if (existingProfile && existingProfile.id !== excludeDeveloperId) {
      throw new AppError(
        "Já existe um perfil profissional vinculado a este usuário.",
        409,
        "DEVELOPER_PROFILE_EXISTS",
        {
          existing_profile: {
            id: existingProfile.id,
            nome: existingProfile.nome,
            senioridade: existingProfile.senioridade,
            bio: existingProfile.bio,
            usuario_id: existingProfile.usuario_id,
          },
        },
      );
    }

    return { id: user.id, nome: user.nome };
  }

  async create(input: CreateDeveloperInput, actorUserId: string): Promise<Developer> {
    return withTransaction(this.db as Pool, async (client) => {
      let resolvedName = input.nome?.trim() || "";
      const usuarioId = input.usuario_id ?? null;

      if (usuarioId) {
        const linkedUser = await this.resolveLinkedUser(client, usuarioId);
        if (!resolvedName) {
          resolvedName = linkedUser.nome;
        }
      }

      try {
        const insertRes = await client.query<{ id: string }>(
          `INSERT INTO desenvolvedor (nome, usuario_id, senioridade, bio)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [resolvedName, usuarioId, input.senioridade ?? null, input.bio ?? null],
        );
        const createdId = insertRes.rows[0].id;

        const { rows } = await client.query(
          `SELECT
             d.id,
             COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
             d.senioridade,
             d.bio,
             d.usuario_id,
             u.nome AS usuario_nome,
             u.role,
             0::int AS competencias_count,
             0::int AS alocacoes_count,
             d.created_at,
             COALESCE(d.updated_at, d.created_at) AS updated_at
           FROM desenvolvedor d
           LEFT JOIN usuario u ON d.usuario_id = u.id
           WHERE d.id = $1`,
          [createdId],
        );

        const created = normalizeDeveloperRow(rows[0]);

        await auditService.record(
          {
            usuario_id: actorUserId,
            entidade_tipo: "desenvolvedor",
            entidade_id: created.id,
            acao: "CRIAR_PERFIL_PROFISSIONAL",
            dados_json: {
              nome: created.nome,
              senioridade: created.senioridade,
              bio: created.bio,
              usuario_id: created.usuario_id,
            },
          },
          client,
        );

        return created;
      } catch (err: unknown) {
        if ((err as { code?: string }).code === "23505" && usuarioId) {
          const existingProfile = await this.findByUsuarioId(usuarioId, client);
          throw new AppError(
            "Já existe um perfil profissional vinculado a este usuário.",
            409,
            "DEVELOPER_PROFILE_EXISTS",
            existingProfile
              ? {
                  existing_profile: {
                    id: existingProfile.id,
                    nome: existingProfile.nome,
                    senioridade: existingProfile.senioridade,
                    bio: existingProfile.bio,
                    usuario_id: existingProfile.usuario_id,
                  },
                }
              : undefined,
          );
        }
        throw err;
      }
    });
  }

  async update(
    developerId: string,
    input: UpdateDeveloperInput,
    actorUserId: string,
  ): Promise<Developer> {
    return withTransaction(this.db as Pool, async (client) => {
      const currentRes = await client.query(
        `SELECT d.id, COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
                d.senioridade, d.bio, d.usuario_id
         FROM desenvolvedor d
         LEFT JOIN usuario u ON d.usuario_id = u.id
         WHERE d.id = $1
         FOR UPDATE OF d`,
        [developerId],
      );
      const current = currentRes.rows[0];
      if (!current) {
        throw new NotFoundError("Perfil profissional não encontrado.");
      }

      const nextUsuarioId =
        input.usuario_id !== undefined ? input.usuario_id : (current.usuario_id as string | null);

      let linkedUserName: string | null = null;
      if (nextUsuarioId) {
        const linkedUser = await this.resolveLinkedUser(client, nextUsuarioId, developerId);
        linkedUserName = linkedUser.nome;
      }

      const nextNome =
        input.nome !== undefined && input.nome.trim()
          ? input.nome.trim()
          : (current.nome as string | null) || linkedUserName || "";

      const nextSenioridade =
        input.senioridade !== undefined ? input.senioridade : (current.senioridade as string | null);
      const nextBio =
        input.bio !== undefined ? input.bio : (current.bio as string | null);

      await client.query(
        `UPDATE desenvolvedor
            SET nome = $1,
                usuario_id = $2,
                senioridade = $3,
                bio = $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $5`,
        [nextNome, nextUsuarioId, nextSenioridade, nextBio, developerId],
      );

      const { rows } = await client.query(
        `SELECT
           d.id,
           COALESCE(NULLIF(btrim(d.nome), ''), u.nome) AS nome,
           d.senioridade,
           d.bio,
           d.usuario_id,
           u.nome AS usuario_nome,
           u.role,
           (SELECT COUNT(*)::int FROM competencia c WHERE c.desenvolvedor_id = d.id) AS competencias_count,
           (SELECT COUNT(*)::int FROM alocacao a WHERE a.desenvolvedor_id = d.id) AS alocacoes_count,
           d.created_at,
           COALESCE(d.updated_at, d.created_at) AS updated_at
         FROM desenvolvedor d
         LEFT JOIN usuario u ON d.usuario_id = u.id
         WHERE d.id = $1`,
        [developerId],
      );

      const updated = normalizeDeveloperRow(rows[0]);

      await auditService.record(
        {
          usuario_id: actorUserId,
          entidade_tipo: "desenvolvedor",
          entidade_id: updated.id,
          acao: "ATUALIZAR_PERFIL_PROFISSIONAL",
          dados_json: {
            anterior: {
              nome: current.nome,
              senioridade: current.senioridade,
              bio: current.bio,
              usuario_id: current.usuario_id,
            },
            novo: {
              nome: updated.nome,
              senioridade: updated.senioridade,
              bio: updated.bio,
              usuario_id: updated.usuario_id,
            },
          },
        },
        client,
      );

      return updated;
    });
  }
}
