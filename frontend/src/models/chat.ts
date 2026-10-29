import type { ChatOrigin } from "../api/api_chat";

export function formatRelative(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "";
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Date(time).toLocaleDateString("pt-BR");
}

export function formatClock(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatClockWithSeconds(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export const ORIGIN_BADGE: Record<ChatOrigin, string | null> = {
  assistente: null,
  busca_textual: "Busca textual",
  sem_resultado: null,
};

export const SUGGESTED_PROMPTS: readonly string[] = [
  "Quais decisões já foram tomadas neste projeto?",
  "Qual é o código de validação do projeto?",
  "Qual é o SLA para solicitação urgente?",
];

type SuggestionContextMessage = { remetente: string; conteudo: string; origem?: ChatOrigin };

/** Retorna próximos passos curtos e autocontidos, baseados no último assunto da conversa. */
export function suggestedPromptsForContext(messages: readonly SuggestionContextMessage[]): readonly string[] {
  const lastAssistant = [...messages].reverse().find(message => message.remetente === "assistant");
  const lastQuestion = [...messages].reverse().find(message => message.remetente === "user")?.conteudo ?? "";
  if (!lastQuestion) return SUGGESTED_PROMPTS;

  const topic = lastQuestion.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const noEvidence = lastAssistant?.origem === "sem_resultado"
    || /^(informacao nao encontrada no acervo|esse assunto esta fora do escopo)/i.test(
      (lastAssistant?.conteudo ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    );
  if (/banco|postgres|mysql|mariadb|mongodb|\bsql\b|database/.test(topic)) {
    return noEvidence
      ? ["Há registro de PostgreSQL, MySQL ou outro banco de dados?", "Quais decisões técnicas estão documentadas?", "Quais tecnologias são citadas no acervo?"]
      : ["Quais decisões sobre banco de dados estão registradas?", "Quais outras tecnologias são citadas no projeto?", "Há integrações relacionadas ao banco de dados?"];
  }
  if (/decis|arquitet|tecnolog|stack|integrac/.test(topic)) {
    return noEvidence
      ? ["Quais requisitos do projeto estão documentados?", "Quais documentos foram adicionados ao acervo?", "Quais tecnologias aparecem nos requisitos?"]
      : ["Quais requisitos se relacionam a essa decisão técnica?", "Quais tecnologias e integrações estão registradas?", "Há outras decisões de arquitetura documentadas?"];
  }
  if (/requisit|funcional|criterio|historia|pbi|feature/.test(topic)) {
    return noEvidence
      ? ["Quais decisões foram registradas no projeto?", "Quais tecnologias são citadas nos documentos?", "Que informações estão disponíveis sobre a arquitetura?"]
      : ["Quais critérios de aceitação estão relacionados?", "Há decisões técnicas ligadas a esse requisito?", "Quais dependências desse requisito estão documentadas?"];
  }
  if (noEvidence) return [
    "Quais decisões foram registradas neste projeto?",
    "Quais tecnologias e integrações aparecem no acervo?",
    "Quais requisitos estão documentados?",
  ];
  return [
    "Quais decisões se relacionam a essa pergunta?",
    "Quais requisitos ou regras de negócio estão documentados?",
    "Quais tecnologias aparecem no acervo do projeto?",
  ];
}

export function remainingCharacters(text: string, max: number): number {
  return max - text.length;
}
