import { CriteriaRepository, criteriaRepository } from "../criteria/criteria.repository.js";
import { PbisRepository, pbisRepository } from "../pbis/pbis.repository.js";
import { Pbi } from "../pbis/pbis.types.js";
import { Criterion } from "../criteria/criteria.types.js";
import { NotFoundError } from "../../shared/errors.js";
import {
  validarTituloInfinitivo,
  validarHistoria,
  validarCenario,
  identificarTermosVagos,
  ResultadoValidacao,
  OcorrenciaTermoVago,
} from "./quality.rules.js";
import { QualityCheckResult, QualityReport } from "./quality.types.js";

export interface ResultadoCenario {
  id: string;
  nome: string | null;
  aprovado: boolean;
  motivo?: string;
}

export interface RelatorioQualidadePbi {
  titulo: ResultadoValidacao;
  historia: { aprovado: boolean; alertas: string[] };
  cenarios: ResultadoCenario[];
  termos_vagos: OcorrenciaTermoVago[];
}

export function calculateCompleteness(checks: QualityCheckResult[]): number | null {
  const applicable = checks.filter((check) => check.applicable);
  return applicable.length === 0
    ? null
    : Math.round((applicable.filter((check) => check.passed).length / applicable.length) * 100);
}

export class QualityService {
  constructor(
    private readonly criteriaRepo: CriteriaRepository = criteriaRepository,
    private readonly pbisRepo: PbisRepository = pbisRepository,
  ) {}

  /** Detailed deterministic report shared by the existing PBI quality view. */
  async avaliarPbi(pbi: Pbi): Promise<RelatorioQualidadePbi> {
    const cenariosRegistrados = await this.criteriaRepo.listByEntity("pbi", pbi.id);
    return this.buildDetailedReport(pbi, cenariosRegistrados);
  }

  private buildDetailedReport(pbi: Pbi, cenariosRegistrados: Criterion[]): RelatorioQualidadePbi {
    const cenarios: ResultadoCenario[] = cenariosRegistrados.map((cenario) => {
      const resultado = validarCenario({ dado: cenario.dado ?? "", quando: cenario.quando ?? "", entao: cenario.entao ?? "" });
      return { id: cenario.id, nome: cenario.nome, aprovado: resultado.aprovado, motivo: resultado.motivo };
    });
    const termosVagos: OcorrenciaTermoVago[] = [
      { campo: "titulo", termos: identificarTermosVagos(pbi.titulo) },
      { campo: "historia_como_um", termos: identificarTermosVagos(pbi.historia_como_um) },
      { campo: "historia_eu_quero", termos: identificarTermosVagos(pbi.historia_eu_quero) },
      { campo: "historia_para_que", termos: identificarTermosVagos(pbi.historia_para_que) },
      ...cenariosRegistrados.map((cenario) => ({
        campo: `cenario:${cenario.nome ?? cenario.id}`,
        termos: identificarTermosVagos([cenario.dado, cenario.quando, cenario.entao].filter(Boolean).join(" ")),
      })),
    ].filter((ocorrencia) => ocorrencia.termos.length > 0);

    return {
      titulo: validarTituloInfinitivo(pbi.titulo),
      historia: validarHistoria({ comoUm: pbi.historia_como_um, euQuero: pbi.historia_eu_quero, paraQue: pbi.historia_para_que }),
      cenarios,
      termos_vagos: termosVagos,
    };
  }

  /** Computes the backlog indicator from the same rules used by the detail report. */
  async validatePbi(pbiId: string): Promise<QualityReport> {
    const pbi = await this.pbisRepo.findById(pbiId);
    if (!pbi) throw new NotFoundError("PBI não encontrado.");

    const criteria = await this.criteriaRepo.listByEntity("pbi", pbiId);
    return this.buildCompletenessReport(pbi, this.buildDetailedReport(pbi, criteria));
  }

  /** Computes a page of indicators with one criteria query, avoiding an N+1 query pattern. */
  async validatePbis(pbis: Pbi[]): Promise<Map<string, QualityReport>> {
    if (pbis.length === 0) return new Map();
    const criteria = await this.criteriaRepo.listByEntities("pbi", pbis.map((pbi) => pbi.id));
    const grouped = new Map<string, Criterion[]>();
    for (const criterion of criteria) {
      const items = grouped.get(criterion.entidade_id) ?? [];
      items.push(criterion);
      grouped.set(criterion.entidade_id, items);
    }
    return new Map(pbis.map((pbi) => [
      pbi.id,
      this.buildCompletenessReport(pbi, this.buildDetailedReport(pbi, grouped.get(pbi.id) ?? [])),
    ]));
  }

  private buildCompletenessReport(pbi: Pbi, report: RelatorioQualidadePbi): QualityReport {
    const checks: QualityCheckResult[] = [
      {
        check_id: "titulo_infinitivo",
        check_name: "Título começa com verbo no infinitivo",
        passed: report.titulo.aprovado,
        message: report.titulo.motivo ?? "O título está em conformidade com o padrão.",
        applicable: true,
      },
      {
        check_id: "historia_completa",
        check_name: "História do usuário completa",
        passed: report.historia.aprovado,
        message: report.historia.aprovado ? "A história do usuário está completa." : report.historia.alertas.join(" "),
        applicable: true,
      },
      {
        check_id: "cenario_estruturado",
        check_name: "Cenários estruturados",
        passed: report.cenarios.length > 0 && report.cenarios.every((cenario) => cenario.aprovado),
        message: report.cenarios.length === 0
          ? "O PBI não possui cenários de aceitação registrados."
          : report.cenarios.every((cenario) => cenario.aprovado)
            ? "Todos os cenários estão estruturados com DADO/QUANDO/ENTÃO."
            : "Existem cenários incompletos (faltam blocos DADO/QUANDO/ENTÃO).",
        applicable: true,
      },
      {
        check_id: "termos_vagos",
        check_name: "Ausência de termos vagos",
        passed: report.termos_vagos.length === 0,
        message: report.termos_vagos.length === 0
          ? "Não foram identificados termos vagos."
          : `Foram identificados termos vagos: ${[...new Set(report.termos_vagos.flatMap((item) => item.termos))].join(", ")}. Considere substituir por condições verificáveis.`,
        applicable: true,
      },
    ];
    return { entity_type: "pbi", entity_id: pbi.id, checks, score_completude: calculateCompleteness(checks) };
  }
}

export const qualityService = new QualityService();
