import type { Pool } from "pg";
import { pool } from "../../database/db.js";
import { projectAccessSql } from "../projects/project-access.js";

export interface VocabularyTechnology {
  id: string;
  nome: string;
}

export interface CompetencyEvidence {
  tecnologia_id: string;
  tecnologia_nome: string;
  nivel: string;
  evidencia: string | null;
}

export interface ProjectExperience {
  projeto_id: string;
  projeto_nome: string;
  papeis: string[];
  em_andamento: boolean;
  /** Tecnologias consultadas que aparecem nos itens do projeto. */
  tecnologias: VocabularyTechnology[];
  inicio: string;
  fim: string | null;
}

export interface ProfessionalExperience {
  desenvolvedor_id: string;
  nome: string;
  senioridade: string | null;
  competencias: CompetencyEvidence[];
  projetos: ProjectExperience[];
}

const ITEM_TECHNOLOGIES_SQL = `
  SELECT e.projeto_id, et.tecnologia_id
  FROM entidade_tecnologia et JOIN epico e ON et.entidade_tipo = 'epico' AND e.id = et.entidade_id
  WHERE e.status <> 'arquivado'
  UNION
  SELECT e.projeto_id, et.tecnologia_id
  FROM entidade_tecnologia et JOIN feature f ON et.entidade_tipo = 'feature' AND f.id = et.entidade_id
  JOIN epico e ON e.id = f.epico_id
  WHERE e.status <> 'arquivado' AND f.status <> 'arquivado'
  UNION
  SELECT e.projeto_id, et.tecnologia_id
  FROM entidade_tecnologia et JOIN pbi b ON et.entidade_tipo = 'pbi' AND b.id = et.entidade_id
  JOIN feature f ON f.id = b.feature_id JOIN epico e ON e.id = f.epico_id
  WHERE e.status <> 'arquivado' AND f.status <> 'arquivado' AND b.status <> 'arquivado'
  UNION
  SELECT et.entidade_id AS projeto_id, et.tecnologia_id
  FROM entidade_tecnologia et WHERE et.entidade_tipo = 'projeto'
`;

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export class TeamRepository {
  constructor(private readonly db: Pick<Pool, "query"> = pool) {}

  async accessibleProjectIds(userId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ id: string }>(
      `SELECT p.id FROM projeto p WHERE p.status <> 'arquivado' AND ${projectAccessSql("p.id", "$1")}`,
      [userId],
    );
    return rows.map((row) => row.id);
  }

  /** Feature com as tecnologias dela e dos PBIs não arquivados, ou null se não existir. */
  async featureTechnologies(featureId: string): Promise<{
    id: string;
    titulo: string;
    projeto_id: string;
    status: string;
    tecnologias: VocabularyTechnology[];
  } | null> {
    const { rows } = await this.db.query<{ id: string; titulo: string; projeto_id: string; status: string; tecnologias: VocabularyTechnology[] }>(
      `SELECT f.id, f.titulo, e.projeto_id, f.status,
              COALESCE((
                SELECT jsonb_agg(DISTINCT jsonb_build_object('id', t.id, 'nome', t.nome))
                FROM entidade_tecnologia et JOIN tecnologia t ON t.id = et.tecnologia_id
                WHERE (et.entidade_tipo = 'feature' AND et.entidade_id = f.id)
                   OR (et.entidade_tipo = 'pbi' AND et.entidade_id IN (
                        SELECT b.id FROM pbi b WHERE b.feature_id = f.id AND b.status <> 'arquivado'))
              ), '[]'::jsonb) AS tecnologias
       FROM feature f JOIN epico e ON e.id = f.epico_id
       WHERE f.id = $1`,
      [featureId],
    );
    const row = rows[0];
    if (!row) return null;
    return { ...row, tecnologias: [...row.tecnologias].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) };
  }

  /** Profissionais com alocação vigente no projeto, para sinalizar quem já está na demanda. */
  async currentlyAllocated(projectId: string): Promise<Set<string>> {
    const { rows } = await this.db.query<{ desenvolvedor_id: string }>(
      `SELECT DISTINCT desenvolvedor_id FROM alocacao
       WHERE projeto_id = $1 AND data_inicio <= CURRENT_TIMESTAMP
         AND (data_fim IS NULL OR data_fim > CURRENT_TIMESTAMP)`,
      [projectId],
    );
    return new Set(rows.map((row) => row.desenvolvedor_id));
  }

  async vocabulary(): Promise<VocabularyTechnology[]> {
    const { rows } = await this.db.query<VocabularyTechnology>("SELECT id, nome FROM tecnologia ORDER BY nome, id");
    return rows;
  }

  /**
   * Profissionais com experiência registrada nas tecnologias, por duas evidências:
   * competência no perfil (com nível e evidência) e alocação em projeto cujos itens usam a
   * tecnologia. A experiência em projetos considera somente `projectIds`, que o chamador já
   * restringiu aos projetos autorizados do solicitante.
   */
  async experienceWith(technologyIds: string[], projectIds: string[]): Promise<ProfessionalExperience[]> {
    if (technologyIds.length === 0) return [];
    const [competencies, projects] = await Promise.all([
      this.db.query<CompetencyEvidence & { desenvolvedor_id: string; nome: string; senioridade: string | null }>(
        `SELECT d.id AS desenvolvedor_id, COALESCE(NULLIF(btrim(d.nome), ''), u.nome, 'Profissional') AS nome, d.senioridade,
                c.tecnologia_id, t.nome AS tecnologia_nome, c.nivel, c.evidencia
         FROM competencia c
         JOIN desenvolvedor d ON d.id = c.desenvolvedor_id
         LEFT JOIN usuario u ON u.id = d.usuario_id
         JOIN tecnologia t ON t.id = c.tecnologia_id
         WHERE c.tecnologia_id = ANY($1::uuid[])
           AND (u.id IS NULL OR u.ativo)`,
        [technologyIds],
      ),
      projectIds.length === 0
        ? Promise.resolve({ rows: [] as Array<Record<string, unknown>> })
        : this.db.query(
            `WITH usos AS (${ITEM_TECHNOLOGIES_SQL})
             SELECT d.id AS desenvolvedor_id, COALESCE(NULLIF(btrim(d.nome), ''), u.nome, 'Profissional') AS nome, d.senioridade,
                    p.id AS projeto_id, p.nome AS projeto_nome,
                    array_agg(DISTINCT a.papel ORDER BY a.papel) AS papeis,
                    bool_or(a.data_fim IS NULL OR a.data_fim > CURRENT_TIMESTAMP) AS em_andamento,
                    min(a.data_inicio) AS inicio,
                    CASE WHEN bool_or(a.data_fim IS NULL) THEN NULL ELSE max(a.data_fim) END AS fim,
                    jsonb_agg(DISTINCT jsonb_build_object('id', t.id, 'nome', t.nome)) AS tecnologias
             FROM alocacao a
             JOIN desenvolvedor d ON d.id = a.desenvolvedor_id
             LEFT JOIN usuario u ON u.id = d.usuario_id
             JOIN projeto p ON p.id = a.projeto_id AND p.status <> 'arquivado'
             JOIN usos ON usos.projeto_id = p.id
             JOIN tecnologia t ON t.id = usos.tecnologia_id
             WHERE usos.tecnologia_id = ANY($1::uuid[])
               AND p.id = ANY($2::uuid[])
               AND a.data_inicio <= CURRENT_TIMESTAMP
               AND (u.id IS NULL OR u.ativo)
             GROUP BY d.id, d.nome, u.nome, d.senioridade, p.id, p.nome`,
            [technologyIds, projectIds],
          ),
    ]);

    const byDeveloper = new Map<string, ProfessionalExperience>();
    const ensure = (row: { desenvolvedor_id: unknown; nome: unknown; senioridade: unknown }) => {
      const id = String(row.desenvolvedor_id);
      let entry = byDeveloper.get(id);
      if (!entry) {
        entry = { desenvolvedor_id: id, nome: String(row.nome), senioridade: (row.senioridade as string | null) ?? null, competencias: [], projetos: [] };
        byDeveloper.set(id, entry);
      }
      return entry;
    };
    for (const row of competencies.rows) {
      ensure(row).competencias.push({
        tecnologia_id: row.tecnologia_id,
        tecnologia_nome: row.tecnologia_nome,
        nivel: row.nivel,
        evidencia: row.evidencia,
      });
    }
    for (const row of projects.rows) {
      const technologies = (row.tecnologias as VocabularyTechnology[]).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      ensure(row as { desenvolvedor_id: unknown; nome: unknown; senioridade: unknown }).projetos.push({
        projeto_id: String(row.projeto_id),
        projeto_nome: String(row.projeto_nome),
        papeis: ((row.papeis as string[] | null) ?? []).filter(Boolean),
        em_andamento: Boolean(row.em_andamento),
        tecnologias: technologies,
        inicio: toIso(row.inicio),
        fim: row.fim ? toIso(row.fim) : null,
      });
    }
    return [...byDeveloper.values()];
  }
}
