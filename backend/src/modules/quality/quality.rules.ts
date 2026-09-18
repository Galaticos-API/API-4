// =======================================
// CONFIGURAÇÃO DO MOTOR DE QUALIDADE
// =======================================

export const TERMOS_VAGOS_PADRAO: readonly string[] = ["adequado", "rápido", "rapido", "intuitivo", "correto", "bonito"];

export const EXCECOES_VERBO_INFINITIVO: readonly string[] = [];

export const LIMITE_CARACTERES_HISTORIA = 300;

const SUFIXOS_INFINITIVO = ["ar", "er", "ir", "or"];

// =======================================
// INTERFACES
// =======================================

export interface ResultadoValidacao {
  aprovado: boolean;
  motivo?: string;
}

export interface ResultadoHistoria {
  aprovado: boolean;
  alertas: string[];
}

export interface OcorrenciaTermoVago {
  campo: string;
  termos: string[];
}

// =======================================
// VALIDAÇÕES DETERMINÍSTICAS
// =======================================

export function validarTituloInfinitivo(titulo: string, excecoes: readonly string[] = EXCECOES_VERBO_INFINITIVO): ResultadoValidacao {
  const primeiraPalavra = titulo.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  if (excecoes.some((excecao) => excecao.toLowerCase() === primeiraPalavra)) {
    return { aprovado: true };
  }

  const terminaComInfinitivo = SUFIXOS_INFINITIVO.some((sufixo) => primeiraPalavra.endsWith(sufixo));
  if (!terminaComInfinitivo) {
    return {
      aprovado: false,
      motivo: `O título deve iniciar com um verbo no infinitivo (ex.: "Consultar solicitação", "Cadastrar item"). "${primeiraPalavra || titulo}" não corresponde ao padrão.`,
    };
  }

  return { aprovado: true };
}

export function validarHistoria(
  historia: { comoUm: string; euQuero: string; paraQue: string },
  limiteCaracteres: number = LIMITE_CARACTERES_HISTORIA,
): ResultadoHistoria {
  const blocos: Array<{ nome: string; texto: string }> = [
    { nome: "COMO UM", texto: historia.comoUm },
    { nome: "EU QUERO", texto: historia.euQuero },
    { nome: "PARA QUE", texto: historia.paraQue },
  ];

  const blocoAusente = blocos.find((bloco) => bloco.texto.trim().length === 0);
  if (blocoAusente) {
    return { aprovado: false, alertas: [`O bloco ${blocoAusente.nome} está ausente.`] };
  }

  const alertas = blocos
    .filter((bloco) => bloco.texto.trim().length > limiteCaracteres)
    .map((bloco) => `O bloco ${bloco.nome} ultrapassa ${limiteCaracteres} caracteres; regras detalhadas pertencem aos cenários de aceitação, não à história.`);

  return { aprovado: true, alertas };
}

export function validarCenario(cenario: { dado: string; quando: string; entao: string }): ResultadoValidacao {
  const blocoFaltante = (["dado", "quando", "entao"] as const).find((campo) => !cenario[campo] || cenario[campo].trim().length === 0);
  if (blocoFaltante) {
    return { aprovado: false, motivo: `O bloco ${blocoFaltante.toUpperCase()} do cenário está ausente.` };
  }

  return { aprovado: true };
}

export function identificarTermosVagos(texto: string, termos: readonly string[] = TERMOS_VAGOS_PADRAO): string[] {
  const textoNormalizado = texto.toLowerCase();
  return termos.filter((termo) => new RegExp(`\\b${termo.toLowerCase()}\\b`, "u").test(textoNormalizado));
}
