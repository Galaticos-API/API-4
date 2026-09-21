// Motor determinístico de qualidade executado no cliente para feedback em tempo real (S1-14 / PBI-01.3.5)

export const TERMOS_VAGOS_PADRAO: readonly string[] = ["adequado", "rápido", "rapido", "intuitivo", "correto", "bonito"];
export const LIMITE_CARACTERES_HISTORIA = 300;
const SUFIXOS_INFINITIVO = ["ar", "er", "ir", "or"];

export interface ValidationResult {
  aprovado: boolean;
  motivo?: string;
}

export interface StoryValidationResult {
  aprovado: boolean;
  blocoAusente?: string;
  alertas: string[];
}

export function validarTituloInfinitivo(titulo: string, excecoes: readonly string[] = []): ValidationResult {
  const primeiraPalavra = titulo.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!primeiraPalavra) {
    return {
      aprovado: false,
      motivo: "O título é obrigatório e deve iniciar com um verbo no infinitivo (ex.: 'Cadastrar item', 'Consultar indicador').",
    };
  }

  if (excecoes.some((ex) => ex.toLowerCase() === primeiraPalavra)) {
    return { aprovado: true };
  }

  const terminaComInfinitivo = SUFIXOS_INFINITIVO.some((sufixo) => primeiraPalavra.endsWith(sufixo));
  if (!terminaComInfinitivo) {
    return {
      aprovado: false,
      motivo: `O título deve iniciar com um verbo no infinitivo (ex.: 'Cadastrar item', 'Consultar indicador'). '${primeiraPalavra}' não termina em -ar, -er, -ir ou -or.`,
    };
  }

  return { aprovado: true };
}

export function validarHistoria(
  historia: { comoUm: string; euQuero: string; paraQue: string },
  limiteCaracteres: number = LIMITE_CARACTERES_HISTORIA,
): StoryValidationResult {
  const blocos: Array<{ nome: string; campoKey: "comoUm" | "euQuero" | "paraQue"; texto: string }> = [
    { nome: "COMO UM", campoKey: "comoUm", texto: historia.comoUm },
    { nome: "EU QUERO", campoKey: "euQuero", texto: historia.euQuero },
    { nome: "PARA QUE", campoKey: "paraQue", texto: historia.paraQue },
  ];

  const blocoAusente = blocos.find((bloco) => bloco.texto.trim().length === 0);
  if (blocoAusente) {
    return {
      aprovado: false,
      blocoAusente: blocoAusente.campoKey,
      alertas: [`O bloco ${blocoAusente.nome} está ausente.`],
    };
  }

  const alertas = blocos
    .filter((bloco) => bloco.texto.trim().length > limiteCaracteres)
    .map((bloco) => `O bloco ${bloco.nome} ultrapassa ${limiteCaracteres} caracteres; regras detalhadas pertencem aos cenários de aceitação, não à história.`);

  return { aprovado: true, alertas };
}

export function validarCenario(cenario: { dado?: string | null; quando?: string | null; entao?: string | null }): ValidationResult {
  const dado = cenario.dado?.trim() ?? "";
  const quando = cenario.quando?.trim() ?? "";
  const entao = cenario.entao?.trim() ?? "";

  if (!dado || !quando || !entao) {
    const faltando: string[] = [];
    if (!dado) faltando.push("DADO");
    if (!quando) faltando.push("QUANDO");
    if (!entao) faltando.push("ENTÃO");
    return {
      aprovado: false,
      motivo: `O cenário está incompleto. Falta preencher: ${faltando.join(", ")}.`,
    };
  }

  return { aprovado: true };
}

export function identificarTermosVagos(texto: string, termos: readonly string[] = TERMOS_VAGOS_PADRAO): string[] {
  if (!texto) return [];
  const textoNormalizado = texto.toLowerCase();
  return termos.filter((termo) => {
    const literalTerm = termo.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${literalTerm}\\b`, "u").test(textoNormalizado);
  });
}

export interface RealtimeQualityCheck {
  check_id: string;
  check_name: string;
  passed: boolean;
  message: string;
  is_blocking: boolean;
  target_field_id: string;
}

export interface RealtimeQualityReport {
  score_completude: number | null;
  checks: RealtimeQualityCheck[];
  has_blocking_issues: boolean;
  blocking_messages: string[];
}

export interface PbiFormEvaluationData {
  titulo: string;
  historia_como_um: string;
  historia_eu_quero: string;
  historia_para_que: string;
  requer_interface: boolean;
  prototipo_vinculado?: boolean;
}

export interface ScenarioEvaluationData {
  id?: string;
  nome?: string | null;
  dado?: string | null;
  quando?: string | null;
  entao?: string | null;
}

export function evaluatePbiRealtime(
  data: PbiFormEvaluationData,
  cenarios: ScenarioEvaluationData[],
  organizationConfig: { checks?: Record<string, boolean>; vague_terms?: string[] } | null,
  fieldPrefix: string = "",
): RealtimeQualityReport {
  const activeChecks = organizationConfig?.checks ?? {
    titulo_infinitivo: true,
    historia_completa: true,
    cenario_estruturado: true,
    termos_vagos: true,
    prototipo_vinculado: true,
  };

  const vagueTerms = organizationConfig?.vague_terms && organizationConfig.vague_terms.length > 0
    ? organizationConfig.vague_terms
    : TERMOS_VAGOS_PADRAO;

  const checks: RealtimeQualityCheck[] = [];

  // 1. Título no infinitivo
  if (activeChecks.titulo_infinitivo !== false) {
    const tituloRes = validarTituloInfinitivo(data.titulo);
    checks.push({
      check_id: "titulo_infinitivo",
      check_name: "Título começa com verbo no infinitivo",
      passed: tituloRes.aprovado,
      message: tituloRes.motivo ?? "O título está em conformidade com o padrão.",
      is_blocking: true,
      target_field_id: `${fieldPrefix}titulo`,
    });
  }

  // 2. História do usuário completa
  if (activeChecks.historia_completa !== false) {
    const historiaRes = validarHistoria({
      comoUm: data.historia_como_um,
      euQuero: data.historia_eu_quero,
      paraQue: data.historia_para_que,
    });

    let targetField = `${fieldPrefix}como-um`;
    if (historiaRes.blocoAusente === "euQuero") targetField = `${fieldPrefix}eu-quero`;
    else if (historiaRes.blocoAusente === "paraQue") targetField = `${fieldPrefix}para-que`;

    let msg = "A história do usuário está completa.";
    if (!historiaRes.aprovado) {
      msg = historiaRes.alertas.join(" ");
    } else if (historiaRes.alertas.length > 0) {
      msg = `${msg} Alerta: ${historiaRes.alertas.join(" ")}`;
    }

    checks.push({
      check_id: "historia_completa",
      check_name: "História do usuário completa",
      passed: historiaRes.aprovado,
      message: msg,
      is_blocking: true,
      target_field_id: targetField,
    });
  }

  // 3. Cenários de aceitação estruturados
  if (activeChecks.cenario_estruturado !== false) {
    const temCenarios = cenarios.length > 0;
    const todosEstruturados = temCenarios && cenarios.every((c) => validarCenario(c).aprovado);
    let msg = "Todos os cenários estão estruturados com DADO/QUANDO/ENTÃO.";
    let targetId = "cenarios-section";

    if (!temCenarios) {
      msg = "O PBI não possui cenários de aceitação registrados (ao menos um é necessário para concluir).";
      targetId = "novo-cenario-btn";
    } else if (!todosEstruturados) {
      msg = "Existem cenários incompletos (faltam blocos DADO, QUANDO ou ENTÃO).";
      const primeiroInvalido = cenarios.find((c) => !validarCenario(c).aprovado);
      if (primeiroInvalido?.id) {
        targetId = `cenario-${primeiroInvalido.id}`;
      }
    }

    checks.push({
      check_id: "cenario_estruturado",
      check_name: "Cenários de aceitação estruturados",
      passed: todosEstruturados,
      message: msg,
      is_blocking: true,
      target_field_id: targetId,
    });
  }

  // 4. Termos vagos (Alerta não-bloqueante per PBI-01.3.4 Cenário 2)
  if (activeChecks.termos_vagos !== false) {
    const ocorrencias: Array<{ campo: string; targetId: string; termos: string[] }> = [
      { campo: "Título", targetId: `${fieldPrefix}titulo`, termos: identificarTermosVagos(data.titulo, vagueTerms) },
      { campo: "COMO UM", targetId: `${fieldPrefix}como-um`, termos: identificarTermosVagos(data.historia_como_um, vagueTerms) },
      { campo: "EU QUERO", targetId: `${fieldPrefix}eu-quero`, termos: identificarTermosVagos(data.historia_eu_quero, vagueTerms) },
      { campo: "PARA QUE", targetId: `${fieldPrefix}para-que`, termos: identificarTermosVagos(data.historia_para_que, vagueTerms) },
      ...cenarios.map((c, i) => ({
        campo: `Cenário ${c.nome ? `"${c.nome}"` : i + 1}`,
        targetId: c.id ? `cenario-${c.id}` : "cenarios-section",
        termos: identificarTermosVagos([c.dado, c.quando, c.entao].filter(Boolean).join(" "), vagueTerms),
      })),
    ].filter((item) => item.termos.length > 0);

    const passou = ocorrencias.length === 0;
    let msg = "Não foram identificados termos vagos.";
    let targetId = `${fieldPrefix}titulo`;

    if (!passou) {
      const todosTermos = [...new Set(ocorrencias.flatMap((o) => o.termos))];
      targetId = ocorrencias[0].targetId;
      msg = `Termos vagos identificados (${todosTermos.join(", ")}). Recomenda-se substituir por condições verificáveis (este alerta não impede a conclusão).`;
    }

    checks.push({
      check_id: "termos_vagos",
      check_name: "Ausência de termos vagos",
      passed: passou,
      message: msg,
      is_blocking: false, // Regra fundamental do PBI-01.3.4 Cenário 2
      target_field_id: targetId,
    });
  }

  // 5. Protótipo vinculado (aplicável apenas se requer_interface === true)
  if (activeChecks.prototipo_vinculado !== false && data.requer_interface) {
    const passou = data.prototipo_vinculado === true;
    checks.push({
      check_id: "prototipo_vinculado",
      check_name: "Protótipo associado",
      passed: passou,
      message: passou
        ? "O PBI possui um protótipo associado."
        : "Nenhum protótipo associado. Recomenda-se anexar o protótipo para PBIs que exigem interface.",
      is_blocking: false,
      target_field_id: `${fieldPrefix}requer_interface`,
    });
  }

  const passedCount = checks.filter((c) => c.passed).length;
  const score_completude = checks.length > 0 ? Math.round((passedCount / checks.length) * 100) : null;

  const blockingIssues = checks.filter((c) => c.is_blocking && !c.passed);
  const has_blocking_issues = blockingIssues.length > 0;
  const blocking_messages = blockingIssues.map((c) => `${c.check_name}: ${c.message}`);

  return {
    score_completude,
    checks,
    has_blocking_issues,
    blocking_messages,
  };
}
