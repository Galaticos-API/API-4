import { normalizeTechnologyName } from "../technologies/technologies.types.js";
import type { ChatSource } from "../chat/chat.types.js";
import {
  TeamRepository,
  type ProfessionalExperience,
  type VocabularyTechnology,
} from "./team.repository.js";

const LEVEL_WEIGHT: Record<string, number> = { iniciante: 1, intermediario: 2, avancado: 3, especialista: 4 };
const LEVEL_LABEL: Record<string, string> = {
  iniciante: "iniciante",
  intermediario: "intermediário",
  avancado: "avançado",
  especialista: "especialista",
};

// "quem já trabalhou com X?", "quem conhece X", "alguém tem experiência em X?" e variações.
const QUESTION_PATTERNS = [
  /^(?:quem|qual\s+(?:pessoa|dev(?:eloper)?|desenvolvedor[a]?|profissional)|que\s+(?:pessoa|dev|desenvolvedor[a]?|profissional)|algu[eé]m)\s+(?:da\s+equipe\s+|do\s+time\s+|aqui\s+)?(?:j[aá]\s+)?(?:trabalhou|trabalha|atuou|atua|programou|programa|desenvolveu|desenvolve|mexeu|mexe|usou|usa|utilizou|utiliza|conhece|domina|sabe|entende|tem\s+experi[eê]ncia|possui\s+experi[eê]ncia|teve\s+experi[eê]ncia)\s+(?:(?:com|em|no|na|nos|nas|de|sobre)\s+)?(.+)$/iu,
  /^(?:quem\s+s[aã]o\s+(?:os|as)\s+)?(?:especialistas?|profissionais|pessoas|devs?)\s+(?:em|de|com)\s+(.+)$/iu,
];

// Perguntas sobre projetos ou itens de trabalho seguem para o RAG, não para a consulta de equipe.
const NOT_A_TECHNOLOGY = /^(?:(?:o|a|os|as|esse|essa|este|esta)\s+)?(?:projetos?|clientes?|features?|funcionalidades?|[eé]picos?|pbis?|itens?|tarefas?|documentos?|decis(?:[aã]o|[oõ]es)|requisitos?|sprints?|squads?|reuni[aã]o|reuni[oõ]es)\b/iu;
const PROJECT_CONTEXT = /\b(?:projetos?|sistemas?|aplicativos?|features?|funcionalidades?|requisitos?|clientes?|sprints?|tarefas?|documentos?)\b/iu;

const TRAILING_NOISE = /\s*(?:\?|!|\.)+\s*$|\s+(?:na|no|da|do)\s+(?:equipe|time|f[aá]brica|empresa)\s*$|\s+aqui\s*$|\s+antes\s*$/giu;

/** Extrai o termo de uma pergunta sobre experiência da equipe, ou null se não for uma. */
export function teamTechnologyQuestion(question: string): string | null {
  const clean = question.replace(/\s+/g, " ").trim();
  for (const pattern of QUESTION_PATTERNS) {
    const match = pattern.exec(clean);
    if (!match?.[1]) continue;
    let term = match[1];
    for (let previous = ""; previous !== term; ) {
      previous = term;
      term = term.replace(TRAILING_NOISE, "").trim();
    }
    term = term.replace(/^(?:a|o|as|os|um|uma)\s+/iu, "").replace(/^["'“”]+|["'“”]+$/gu, "").trim();
    if (NOT_A_TECHNOLOGY.test(term) || PROJECT_CONTEXT.test(term)) return null;
    if (normalizeTechnologyName(term).length >= 1) return term;
  }
  return null;
}

/**
 * Resolve o termo no vocabulário controlado. Aceita a grafia exata normalizada ou um nome do
 * vocabulário contido no termo ("integração PIX" encontra "PIX"). Nomes de 1 caractere só casam
 * exatamente, para "C" não aparecer dentro de qualquer palavra.
 */
export function matchVocabulary(term: string, vocabulary: VocabularyTechnology[]): VocabularyTechnology[] {
  const normalizedTerm = normalizeTechnologyName(term);
  if (!normalizedTerm) return [];
  const exact = vocabulary.filter((item) => normalizeTechnologyName(item.nome) === normalizedTerm);
  if (exact.length) return exact;
  const words =
    term.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9+#.]+/).filter(Boolean)
      .map((word) => normalizeTechnologyName(word));
  const containsWholeTechnology = (technologyName: string) => {
    const technologyWords = technologyName.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .split(/[^a-z0-9+#.]+/).filter(Boolean).map(normalizeTechnologyName);
    if (!technologyWords.length) return false;
    return words.some((_, start) => technologyWords.every((word, offset) => words[start + offset] === word));
  };
  return vocabulary.filter((item) => {
    const name = normalizeTechnologyName(item.nome);
    if (name.length < 2) return words.includes(name);
    return containsWholeTechnology(item.nome);
  });
}

export interface RankedProfessional extends ProfessionalExperience {
  pontuacao: number;
}

/** Ordena por evidência: projetos com a tecnologia pesam mais que a autodeclaração de nível. */
export function rankExperience(items: ProfessionalExperience[]): RankedProfessional[] {
  return items
    .map((item) => ({
      ...item,
      pontuacao:
        item.competencias.reduce((sum, competency) => sum + (LEVEL_WEIGHT[competency.nivel] ?? 1), 0) +
        item.projetos.length * 3 +
        item.projetos.filter((project) => project.em_andamento).length,
    }))
    .sort((a, b) => b.pontuacao - a.pontuacao || a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface TeamAnswer {
  resposta: string;
  fontes: ChatSource[];
  encontrado: boolean;
  tecnologias: VocabularyTechnology[];
  profissionais: RankedProfessional[];
}

function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
}

function noRecord(term: string, technologies: VocabularyTechnology[]): TeamAnswer {
  const subject = technologies.length ? list(technologies.map((item) => item.nome)) : `"${term}"`;
  const reason = technologies.length
    ? "Nenhum profissional possui competência registrada nem alocação em projeto autorizado que use essa tecnologia."
    : "A tecnologia não consta no vocabulário controlado, então não há competências nem projetos associados a ela.";
  return {
    resposta: `Não há registro de experiência com ${subject} na equipe. ${reason} Não vou sugerir profissionais sem fundamento.`,
    fontes: [],
    encontrado: false,
    tecnologias: technologies,
    profissionais: [],
  };
}

export class TeamKnowledgeService {
  constructor(private readonly repository: Pick<TeamRepository, "vocabulary" | "experienceWith"> = new TeamRepository()) {}

  async whoWorkedWith(term: string, projectIds: string[]): Promise<TeamAnswer> {
    const technologies = matchVocabulary(term, await this.repository.vocabulary());
    if (technologies.length === 0) return noRecord(term, []);
    const ranked = rankExperience(await this.repository.experienceWith(technologies.map((item) => item.id), projectIds));
    if (ranked.length === 0) return noRecord(term, technologies);

    const lines = ranked.map((person) => {
      const parts: string[] = [];
      for (const competency of person.competencias) {
        parts.push(
          `competência ${LEVEL_LABEL[competency.nivel] ?? competency.nivel} em ${competency.tecnologia_nome}` +
            (competency.evidencia ? ` (evidência: ${competency.evidencia.replace(/\s+/g, " ").trim()})` : ""),
        );
      }
      for (const project of person.projetos) {
        const role = project.papeis.length ? `, como ${list(project.papeis)}` : "";
        const status = project.em_andamento ? ", em andamento" : "";
        parts.push(`atuou em ${project.projeto_nome}${role}${status}, projeto que usa ${list(project.tecnologias.map((item) => item.nome))}`);
      }
      return `- ${person.nome}${person.senioridade ? ` (${person.senioridade})` : ""}: ${parts.join("; ")}.`;
    });

    const fontes = new Map<string, ChatSource>();
    for (const person of ranked) {
      fontes.set(`dev:${person.desenvolvedor_id}`, {
        id: person.desenvolvedor_id,
        titulo: `Perfil profissional de ${person.nome}`,
        tipo: "perfil_profissional",
        url: `/developers/${person.desenvolvedor_id}`,
      });
      for (const project of person.projetos) {
        fontes.set(`proj:${project.projeto_id}`, {
          id: project.projeto_id,
          titulo: `Projeto ${project.projeto_nome}`,
          tipo: "projeto",
          projeto_id: project.projeto_id,
          projeto_nome: project.projeto_nome,
          url: `/projects/${project.projeto_id}`,
        });
      }
    }

    const subject = list(technologies.map((item) => item.nome));
    return {
      resposta:
        `Profissionais com experiência registrada em ${subject}:\n\n${lines.join("\n")}\n\n` +
        "Baseado nas competências registradas nos perfis e nas alocações em projetos que você pode consultar.",
      fontes: [...fontes.values()],
      encontrado: true,
      tecnologias: technologies,
      profissionais: ranked,
    };
  }
}
