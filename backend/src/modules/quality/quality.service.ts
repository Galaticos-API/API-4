import { QualityCheckResult, QualityReport, CompletudeCalculation, EntityType, PbiQualityCheck } from "./quality.types.js";
import { PbisRepository, pbisRepository } from "../pbis/pbis.repository.js";
import { CriteriaRepository, criteriaRepository } from "../criteria/criteria.repository.js";
import { NotFoundError } from "../../shared/errors.js";

const VERB_INFINITIVE_PATTERN = /^(criar|consultar|editar|excluir|listar|buscar|adicionar|remover|atualizar|validar|calcular|gerar|processar|implementar|registrar|configurar|permitir|impossibilitar|sinalizar|exibir|ocultar|habilitar|desabilitar|exportar|importar|arquivar|restaurar|compartilhar|vincular|desvincular|integrar|desintegrar|converter|transformar|filtrar|ordenar|classificar|categorizar|priorizar|agendar|cancelar|reagendar|aprovar|rejeitar|autorizar|revogar|autenticar|desconectar|conectar|desconectar|sincronizar|assincronizar|comprimir|descomprimir|criptografar|descriptografar|assinar|verificar|testar|deploy|deployar|rollback|monitorar|alertar|notificar|enviar|receber|processar|gerenciar|controlar|coordenar|organizar|estruturar|modelar|documentar|treinar|aprender|ensinar|guiar|orientar|suportar|assistir|ajudar|facilitar|otimizar|melhorar|corrigir|consertar|resolver|solucionar|diagnosticar|detectar|prevenir|evitar|reduzir|aumentar|diminuir|escalar|reduzir|expandir|contrair|unir|separar|dividir|multiplicar|somar|subtrair|calcular|estimar|prever|analisar|avaliar|medir|comparar|contrastar|diferenciar|identificar|reconhecer|classificar|rotular|marcar|destacar|enfatizar|sublinhar|ressaltar|exemplificar|ilustrar|demonstrar|provar|confirmar|negar|duvidar|questionar|investigar|explorar|descobrir|inventar|criar|desenvolver|construir|fabricar|produzir|manufacturar|montar|instalar|configurar|personalizar|customizar|adaptar|ajustar|modificar|alterar|mudar|trocar|substituir|repor|renovar|atualizar|upgrade|downgrade|migrar|importar|exportar|transferir|copiar|colar|recortar|deletar|apagar|remover|eliminar|destruir|limpar|esvaziar|preencher|completar|finalizar|terminar|encerrar|fechar|abrir|iniciar|começar|lançar|parar|pausar|continuar|retomar|reiniciar|recarregar|refresh|atualizar)s+/i;

const VAGUE_TERMS = ["adequado", "rápido", "intuitivo", "correto", "bonito", "fácil", "simples", "eficiente", "eficaz", "amigável", "flexível", "robusto", "escalável", "seguro", "confiável", "estável", "performático", "otimizado", "melhor", "pior", "bom", "ruim", "grande", "pequeno", "muito", "pouco", "algum", "vários", "diversos", "muitos", "poucos", "suficiente", "insuficiente", "adequado", "inadequado", "apropriado", "inapropriado", "correto", "incorreto", "válido", "inválido", "aceitável", "inaceitável", "razoável", "irrazoável", "lógico", "ilógico", "consistente", "inconsistente", "coerente", "incoerente", "claro", "confuso", "óbvio", "evidente", "certo", "errado", "verdadeiro", "falso", "real", "irreal", "possível", "impossível", "provável", "improvável", "esperado", "inesperado", "normal", "anormal", "típico", "atípico", "comum", "incomum", "frequente", "raro", "ocasional", "eventual", "contínuo", "descontínuo", "permanente", "temporário", "definitivo", "provisório", "fixo", "variável", "constante", "instável", "estável", "estático", "dinâmico", "ativo", "inativo", "disponível", "indisponível", "acessível", "inacessível", "visível", "invisível", "perceptível", "imperceptível", "notável", "desprezível", "significativo", "insignificante", "importante", "irrelevante", "relevante", "essencial", "secundário", "primário", "principal", "básico", "avançado", "superior", "inferior", "maior", "menor", "melhor", "pior", "igual", "diferente", "similar", "distinto", "idêntico", "único", "múltiplo", "singular", "plural", "individual", "coletivo", "pessoal", "impessoal", "privado", "público", "interno", "externo", "local", "remoto", "próximo", "distante", "longe", "perto", "acima", "abaixo", "dentro", "fora", "entre", "além", "aquém", "através", "via", "por", "para", "com", "sem", "contra", "a favor", "em favor", "contra", "além", "além disso", "além do mais", "também", "ademais", "outrossim", "igualmente", "da mesma forma", "do mesmo modo", "similarmente", "analogamente", "por outro lado", "em contrapartida", "no entanto", "todavia", "contudo", "entretanto", "porém", "mas", "senão", "ou seja", "isto é", "ou melhor", "em outras palavras", "de outro modo", "de outra forma", "por exemplo", "por instância", "como", "tal como", "assim como", "do mesmo jeito", "da mesma maneira", "conforme", "segundo", "de acordo com", "em conformidade com", "em consonância com", "em harmonia com", "em concordância com", "em acordo com", "em linha com", "em sintonia com", "em compatibilidade com", "em conformidade com", "em obediência a", "em respeito a", "em observância a", "em cumprimento a", "em execução de", "em implementação de", "em aplicação de", "em uso de", "em utilização de", "em emprego de", "em exercício de", "em prática de", "em ato de", "em ação de", "em funcionamento de", "em operação de", "em execução de", "em desenvolvimento de", "em criação de", "em produção de", "em fabricação de", "em construção de", "em montagem de", "em instalação de", "em configuração de", "em personalização de", "em customização de", "em adaptação de", "em ajuste de", "em modificação de", "em alteração de", "em mudança de", "em troca de", "em substituição de", "em reposição de", "em renovação de", "em atualização de", "em upgrade de", "em downgrade de", "em migração de", "em importação de", "em exportação de", "em transferência de", "em cópia de", "em colagem de", "em recorte de", "em deleção de", "em apagamento de", "em remoção de", "em eliminação de", "em destruição de", "em limpeza de", "em esvaziamento de", "em preenchimento de", "em complementação de", "em finalização de", "em término de", "em encerramento de", "em fechamento de", "em abertura de", "em início de", "em começo de", "em lançamento de", "em parada de", "em pausa de", "em continuação de", "em retomada de", "em reinício de", "em recarregamento de", "em refresh de", "em atualização de"];

export class QualityService {
  constructor(
    private readonly pbisRepo: PbisRepository = pbisRepository,
    private readonly criteriaRepo: CriteriaRepository = criteriaRepository,
  ) {}

  async validatePbi(pbiId: string): Promise<QualityReport> {
    const pbi = await this.pbisRepo.findById(pbiId);
    if (!pbi) {
      throw new NotFoundError("PBI não encontrado.");
    }

    const checks: QualityCheckResult[] = [];
    
    checks.push(this.validateTitleInfinitive(pbi.titulo));
    checks.push(this.validateUserStoryComplete(pbi));
    checks.push(await this.validateScenariosStructured(pbiId));
    checks.push(this.validateVagueTerms(pbi));

    const completude = this.calculateCompletude(checks);

    return {
      entity_type: "pbi",
      entity_id: pbiId,
      checks,
      score_completude: completude.score,
    };
  }

  private validateTitleInfinitive(titulo: string): QualityCheckResult {
    const passed = VERB_INFINITIVE_PATTERN.test(titulo.trim());
    return {
      check_id: "titulo_infinitivo",
      check_name: "Título começa com verbo no infinitivo",
      passed,
      message: passed 
        ? "O título está em conformidade com o padrão." 
        : "O título deve começar com um verbo no infinitivo (ex: criar, consultar, editar).",
      applicable: true,
    };
  }

  private validateUserStoryComplete(pbi: any): QualityCheckResult {
    const hasComoUm = pbi.historia_como_um && pbi.historia_como_um.trim().length > 0;
    const hasEuQuero = pbi.historia_eu_quero && pbi.historia_eu_quero.trim().length > 0;
    const hasParaQue = pbi.historia_para_que && pbi.historia_para_que.trim().length > 0;
    const passed = hasComoUm && hasEuQuero && hasParaQue;

    let message = "";
    if (!passed) {
      const missing = [];
      if (!hasComoUm) missing.push("COMO UM");
      if (!hasEuQuero) missing.push("EU QUERO");
      if (!hasParaQue) missing.push("PARA QUE");
      message = `Faltam blocos da história: ${missing.join(", ")}.`;
    } else {
      message = "A história do usuário está completa.";
    }

    return {
      check_id: "historia_completa",
      check_name: "História do usuário completa",
      passed,
      message,
      applicable: true,
    };
  }

  private async validateScenariosStructured(pbiId: string): Promise<QualityCheckResult> {
    const criteria = await this.criteriaRepo.listByEntity("pbi", pbiId);
    const hasScenarios = criteria.length > 0;
    
    if (!hasScenarios) {
      return {
        check_id: "cenario_estruturado",
        check_name: "Cenários estruturados",
        passed: false,
        message: "O PBI não possui cenários de aceitação registrados.",
        applicable: true,
      };
    }

    const allStructured = criteria.every(c => 
      c.dado && c.dado.trim().length > 0 &&
      c.quando && c.quando.trim().length > 0 &&
      c.entao && c.entao.trim().length > 0
    );

    return {
      check_id: "cenario_estruturado",
      check_name: "Cenários estruturados",
      passed: allStructured,
      message: allStructured 
        ? "Todos os cenários estão estruturados com DADO/QUANDO/ENTÃO." 
        : "Existem cenários incompletos (faltam blocos DADO/QUANDO/ENTÃO).",
      applicable: true,
    };
  }

  private validateVagueTerms(pbi: any): QualityCheckResult {
    const textToCheck = [
      pbi.titulo,
      pbi.historia_como_um,
      pbi.historia_eu_quero,
      pbi.historia_para_que,
      pbi.regras_observacoes || "",
    ].join(" ").toLowerCase();

    const foundVagueTerms = VAGUE_TERMS.filter(term => 
      textToCheck.includes(term.toLowerCase())
    );

    const passed = foundVagueTerms.length === 0;

    return {
      check_id: "termos_vagos",
      check_name: "Ausência de termos vagos",
      passed,
      message: passed 
        ? "Não foram identificados termos vagos." 
        : `Foram identificados termos vagos: ${foundVagueTerms.join(", ")}. Considere substituir por condições verificáveis.`,
      applicable: true,
    };
  }

  private calculateCompletude(checks: QualityCheckResult[]): CompletudeCalculation {
    const applicableChecks = checks.filter(c => c.applicable);
    const applicableCount = applicableChecks.length;
    
    if (applicableCount === 0) {
      return {
        applicable_checks: 0,
        passed_checks: 0,
        score: null,
      };
    }

    const passedChecks = applicableChecks.filter(c => c.passed);
    const passedCount = passedChecks.length;
    const score = Math.round((passedCount / applicableCount) * 100);

    return {
      applicable_checks: applicableCount,
      passed_checks: passedCount,
      score,
    };
  }
}

export const qualityService = new QualityService();
