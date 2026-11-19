import { NotFoundError, validateUuid } from "../../shared/errors.js";
import { TeamRepository, type ProfessionalExperience, type VocabularyTechnology } from "./team.repository.js";

const LEVEL_WEIGHT: Record<string, number> = { iniciante: 1, intermediario: 2, avancado: 3, especialista: 4 };
const LEVEL_LABEL: Record<string, string> = {
  iniciante: "iniciante", intermediario: "intermediário", avancado: "avançado", especialista: "especialista",
};
const MAX_RECOMMENDATIONS = 5;

export const ADVISORY_NOTICE =
  "Recomendação consultiva: nenhuma alocação é feita automaticamente. A decisão sobre o squad é do gestor.";

export interface TechnologyFit {
  tecnologia: VocabularyTechnology;
  atendida: boolean;
  justificativas: string[];
}

export interface Recommendation {
  desenvolvedor_id: string;
  nome: string;
  senioridade: string | null;
  /** Percentual de tecnologias da feature com evidência registrada (0 a 100). */
  aderencia: number;
  pontuacao: number;
  ja_alocado_no_projeto: boolean;
  tecnologias: TechnologyFit[];
  justificativa: string;
}

export interface RecommendationResult {
  feature: { id: string; titulo: string };
  base_suficiente: boolean;
  mensagem: string;
  aviso: string;
  criterio: string;
  tecnologias: VocabularyTechnology[];
  recomendacoes: Recommendation[];
}

export const RECOMMENDATION_CRITERIA =
  "Aderência = parcela das tecnologias da feature (e dos PBIs dela) com evidência registrada para o profissional. " +
  "Desempate pela profundidade: projetos em que atuou com a tecnologia (3 pontos cada) e nível da competência registrada " +
  "(1 a 4). Só contam projetos que você pode consultar.";

function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
}

/** Função pura: explica e ordena candidatos para as tecnologias da feature. */
export function recommend(
  technologies: VocabularyTechnology[],
  candidates: ProfessionalExperience[],
  allocated: Set<string>,
): Recommendation[] {
  return candidates
    .map((candidate) => {
      let depth = 0;
      const fits: TechnologyFit[] = technologies.map((technology) => {
        const reasons: string[] = [];
        for (const competency of candidate.competencias.filter((item) => item.tecnologia_id === technology.id)) {
          depth += LEVEL_WEIGHT[competency.nivel] ?? 1;
          reasons.push(
            `competência ${LEVEL_LABEL[competency.nivel] ?? competency.nivel}` +
              (competency.evidencia ? ` (evidência: ${competency.evidencia.replace(/\s+/g, " ").trim()})` : ""),
          );
        }
        for (const project of candidate.projetos.filter((item) => item.tecnologias.some((tech) => tech.id === technology.id))) {
          depth += 3;
          reasons.push(`atuou em ${project.projeto_nome}${project.papeis.length ? ` como ${list(project.papeis)}` : ""}`);
        }
        return { tecnologia: technology, atendida: reasons.length > 0, justificativas: reasons };
      });
      const covered = fits.filter((fit) => fit.atendida);
      const missing = fits.filter((fit) => !fit.atendida).map((fit) => fit.tecnologia.nome);
      const aderencia = Math.round((covered.length / technologies.length) * 100);
      const justificativa =
        covered.map((fit) => `${fit.tecnologia.nome}: ${fit.justificativas.join("; ")}`).join(". ") +
        (missing.length ? `. Sem evidência registrada em ${list(missing)}.` : ".");
      return {
        desenvolvedor_id: candidate.desenvolvedor_id,
        nome: candidate.nome,
        senioridade: candidate.senioridade,
        aderencia,
        pontuacao: depth,
        ja_alocado_no_projeto: allocated.has(candidate.desenvolvedor_id),
        tecnologias: fits,
        justificativa,
      };
    })
    .filter((item) => item.aderencia > 0)
    .sort((a, b) => b.aderencia - a.aderencia || b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome, "pt-BR"))
    .slice(0, MAX_RECOMMENDATIONS);
}

type RepositoryPort = Pick<TeamRepository, "featureTechnologies" | "experienceWith" | "accessibleProjectIds" | "currentlyAllocated">;

export class RecommendationsService {
  constructor(private readonly repository: RepositoryPort = new TeamRepository()) {}

  async forFeature(featureId: string, viewerUserId: string): Promise<RecommendationResult> {
    validateUuid(featureId, "ID da feature");
    const feature = await this.repository.featureTechnologies(featureId);
    if (!feature) throw new NotFoundError("Feature não encontrada.");
    const base = {
      feature: { id: feature.id, titulo: feature.titulo },
      aviso: ADVISORY_NOTICE,
      criterio: RECOMMENDATION_CRITERIA,
      tecnologias: feature.tecnologias,
    };
    if (feature.tecnologias.length === 0) {
      return {
        ...base,
        base_suficiente: false,
        mensagem: "A feature não possui tecnologias associadas, então não há base suficiente para recomendar profissionais. Associe as tecnologias à feature ou aos PBIs dela.",
        recomendacoes: [],
      };
    }
    const [projectIds, allocated] = await Promise.all([
      this.repository.accessibleProjectIds(viewerUserId),
      this.repository.currentlyAllocated(feature.projeto_id),
    ]);
    const candidates = await this.repository.experienceWith(feature.tecnologias.map((item) => item.id), projectIds);
    const recomendacoes = recommend(feature.tecnologias, candidates, allocated);
    if (recomendacoes.length === 0) {
      return {
        ...base,
        base_suficiente: false,
        mensagem: `Nenhum profissional possui experiência registrada em ${list(feature.tecnologias.map((item) => item.nome))}. Não há base suficiente para recomendar.`,
        recomendacoes: [],
      };
    }
    return {
      ...base,
      base_suficiente: true,
      mensagem: `${recomendacoes.length} profissional(is) com aderência às tecnologias da feature.`,
      recomendacoes,
    };
  }
}
