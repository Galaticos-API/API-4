// Os aliases são constantes dos repositórios, nunca valores recebidos pela API.
export function knowledgeSourceSql(alias:string) {
  return `CASE
    WHEN ${alias}.entidade_tipo IN ('epico','feature','pbi','decisao') THEN EXISTS (
      SELECT 1 FROM indice_origem origin WHERE origin.projeto_id=${alias}.projeto_id
        AND origin.entidade_tipo=${alias}.entidade_tipo AND origin.entidade_id=${alias}.entidade_id AND origin.elegivel)
    WHEN ${alias}.entidade_tipo='documento' THEN EXISTS (
      SELECT 1 FROM documento d WHERE d.id=${alias}.entidade_id AND d.projeto_id=${alias}.projeto_id AND d.status_processamento='processado')
    WHEN ${alias}.entidade_tipo='analise_repositorio' THEN EXISTS (
      SELECT 1 FROM analise_repositorio r WHERE r.id=${alias}.entidade_id AND r.projeto_id=${alias}.projeto_id
        AND r.status='concluido' AND r.aprovado_por IS NOT NULL AND r.aprovado_em IS NOT NULL
        AND r.aprovacao_hash=encode(sha256(convert_to(r.relatorio_markdown,'UTF8')),'hex'))
    ELSE FALSE END`;
}
