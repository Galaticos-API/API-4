import { CriteriaRepository, criteriaRepository } from "../criteria/criteria.repository.js";
import { Pbi } from "../pbis/pbis.types.js";
import {
  validarTituloInfinitivo,
  validarHistoria,
  validarCenario,
  identificarTermosVagos,
  ResultadoValidacao,
  OcorrenciaTermoVago,
} from "./quality.rules.js";

// =======================================
// INTERFACES
// =======================================

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

// =======================================
// SERVIÇO
// =======================================

export class QualityService {
  constructor(private readonly criteriaRepo: CriteriaRepository = criteriaRepository) {}

  async avaliarPbi(pbi: Pbi): Promise<RelatorioQualidadePbi> {
    const cenariosRegistrados = await this.criteriaRepo.listByEntity("pbi", pbi.id);

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
}

export const qualityService = new QualityService();
