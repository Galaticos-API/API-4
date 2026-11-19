import type { Pool, PoolClient } from "pg";
import { pool } from "../../database/db.js";
import { withTransaction } from "../../database/transaction.js";
import type {
  ExportEpic,
  ExportEpicRef,
  ExportFeature,
  ExportPbi,
  ExportScenario,
  ExportTextCriterion,
} from "./backlog-export.types.js";

type Row<T> = T & { projeto_status?: string };
type CriterionRow = ExportScenario & ExportTextCriterion & { entidade_tipo: string; entidade_id: string };
type FeatureRow = Omit<ExportFeature, "criterios" | "pbis">;
type PbiRow = Omit<ExportPbi, "cenarios">;

export interface EpicExportRecord {
  projeto_status: string;
  epic: ExportEpic;
}

export interface FeatureExportRecord {
  projeto_status: string;
  epic: ExportEpicRef;
  feature: ExportFeature;
}

export interface BacklogExportReader {
  loadEpic(id: string): Promise<EpicExportRecord | null>;
  loadFeature(id: string): Promise<FeatureExportRecord | null>;
}

// A numeração conta todos os irmãos (inclusive arquivados) por (created_at, id), igual
// para épico, feature e PBI. Itens arquivados são removidos depois de numerados.
const EPIC_SQL = `
  SELECT e.id, e.titulo, e.descricao, e.objetivo, e.escopo_macro, e.resultado_esperado, e.prioridade, e.status,
         p.status AS projeto_status,
         (SELECT COUNT(*)::int FROM epico s WHERE s.projeto_id = e.projeto_id AND (s.created_at, s.id) <= (e.created_at, e.id)) AS numero
  FROM epico e JOIN projeto p ON p.id = e.projeto_id
  WHERE e.id = $1`;

const FEATURES_OF_EPIC_SQL = `
  SELECT * FROM (
    SELECT f.id, f.epico_id, f.titulo, f.descricao, f.objetivo, f.prioridade, f.status,
           ROW_NUMBER() OVER (ORDER BY f.created_at, f.id)::int AS numero
    FROM feature f WHERE f.epico_id = $1
  ) ranked
  WHERE ranked.status <> 'arquivado'
  ORDER BY ranked.numero`;

const FEATURE_SQL = `
  SELECT f.id, f.epico_id, f.titulo, f.descricao, f.objetivo, f.prioridade, f.status,
         (SELECT COUNT(*)::int FROM feature s WHERE s.epico_id = f.epico_id AND (s.created_at, s.id) <= (f.created_at, f.id)) AS numero
  FROM feature f WHERE f.id = $1`;

const EPIC_REF_SQL = `
  SELECT e.id, e.titulo, e.status, p.status AS projeto_status,
         (SELECT COUNT(*)::int FROM epico s WHERE s.projeto_id = e.projeto_id AND (s.created_at, s.id) <= (e.created_at, e.id)) AS numero
  FROM epico e JOIN projeto p ON p.id = e.projeto_id
  WHERE e.id = $1`;

const PBIS_SQL = `
  SELECT * FROM (
    SELECT b.id, b.feature_id, b.titulo, b.prioridade, b.status, b.historia_como_um, b.historia_eu_quero,
           b.historia_para_que, b.regras_observacoes,
           ROW_NUMBER() OVER (PARTITION BY b.feature_id ORDER BY b.created_at, b.id)::int AS numero
    FROM pbi b WHERE b.feature_id = ANY($1::uuid[])
  ) ranked
  WHERE ranked.status <> 'arquivado'
  ORDER BY ranked.feature_id, ranked.numero`;

const CRITERIA_SQL = `
  SELECT c.entidade_tipo, c.entidade_id, c.ordem, c.texto, c.nome, c.dado, c.quando, c.entao
  FROM criterio_aceitacao c
  WHERE (c.entidade_tipo = $1 AND c.entidade_id = $2)
     OR (c.entidade_tipo = 'feature' AND c.entidade_id = ANY($3::uuid[]))
     OR (c.entidade_tipo = 'pbi' AND c.entidade_id = ANY($4::uuid[]))
  ORDER BY c.entidade_tipo, c.entidade_id, c.ordem, c.id`;

export class BacklogExportRepository implements BacklogExportReader {
  constructor(private readonly db: Pool = pool) {}

  async loadEpic(id: string): Promise<EpicExportRecord | null> {
    return withTransaction(this.db, async (client) => {
      const epic = (await client.query<Row<Omit<ExportEpic, "criterios" | "features">>>(EPIC_SQL, [id])).rows[0];
      if (!epic) return null;
      const features = (await client.query<FeatureRow>(FEATURES_OF_EPIC_SQL, [id])).rows;
      const { pbis, criteria: criteriaByEntity } = await this.loadChildren(client, "epico", id, features.map((feature) => feature.id));
      const { projeto_status, ...data } = epic;
      return {
        projeto_status: projeto_status ?? "",
        epic: {
          ...data,
          criterios: textCriteriaOf(criteriaByEntity, "epico", id),
          features: features.map((feature) => assembleFeature(feature, pbis, criteriaByEntity)),
        },
      };
    }, "snapshot");
  }

  async loadFeature(id: string): Promise<FeatureExportRecord | null> {
    return withTransaction(this.db, async (client) => {
      const feature = (await client.query<FeatureRow>(FEATURE_SQL, [id])).rows[0];
      if (!feature) return null;
      const epic = (await client.query<Row<ExportEpicRef>>(EPIC_REF_SQL, [feature.epico_id])).rows[0];
      if (!epic) return null;
      const { pbis, criteria: criteriaByEntity } = await this.loadChildren(client, "feature", id, [id]);
      const { projeto_status, ...epicRef } = epic;
      return { projeto_status: projeto_status ?? "", epic: epicRef, feature: assembleFeature(feature, pbis, criteriaByEntity) };
    }, "snapshot");
  }

  private async loadChildren(client: PoolClient, rootType: "epico" | "feature", rootId: string, featureIds: string[]) {
    const pbis = (await client.query<PbiRow>(PBIS_SQL, [featureIds])).rows;
    const criteria = (await client.query<CriterionRow>(CRITERIA_SQL, [rootType, rootId, featureIds, pbis.map((pbi) => pbi.id)])).rows;
    return { pbis: indexPbis(pbis), criteria: indexCriteria(criteria) };
  }
}

type CriteriaIndex = Map<string, CriterionRow[]>;
type PbiIndex = Map<string, PbiRow[]>;
const criteriaKey = (tipo: string, id: string) => `${tipo}\0${id}`;

function indexPbis(pbis: PbiRow[]): PbiIndex {
  const byFeature: PbiIndex = new Map();
  for (const pbi of pbis) {
    const bucket = byFeature.get(pbi.feature_id);
    if (bucket) bucket.push(pbi);
    else byFeature.set(pbi.feature_id, [pbi]);
  }
  return byFeature;
}

export function indexCriteria(criteria: CriterionRow[]): CriteriaIndex {
  const byEntity: CriteriaIndex = new Map();
  for (const criterion of criteria) {
    const key = criteriaKey(criterion.entidade_tipo, criterion.entidade_id);
    const bucket = byEntity.get(key);
    if (bucket) bucket.push(criterion);
    else byEntity.set(key, [criterion]);
  }
  return byEntity;
}

function textCriteriaOf(criteria: CriteriaIndex, tipo: string, id: string): ExportTextCriterion[] {
  return (criteria.get(criteriaKey(tipo, id)) ?? []).map(({ ordem, texto }) => ({ ordem, texto }));
}

function assembleFeature(feature: FeatureRow, pbis: PbiIndex, criteria: CriteriaIndex): ExportFeature {
  return {
    ...feature,
    criterios: textCriteriaOf(criteria, "feature", feature.id),
    pbis: (pbis.get(feature.id) ?? [])
      .map((pbi) => ({
        ...pbi,
        cenarios: (criteria.get(criteriaKey("pbi", pbi.id)) ?? [])
          .map(({ ordem, nome, dado, quando, entao }) => ({ ordem, nome, dado, quando, entao })),
      })),
  };
}

export const backlogExportRepository = new BacklogExportRepository();
