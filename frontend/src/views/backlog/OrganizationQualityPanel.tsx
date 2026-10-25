import { useEffect, useState } from 'react';
import { getOrganizationQuality, type Level, type OrganizationQualityReport } from '../../api/api_organization_quality';
import { Button } from '../common/ui';

export function OrganizationQualityPanel({kind,id,refreshTrigger=0}:{kind:Level;id:string;refreshTrigger?:number}) {
  const [report,setReport]=useState<OrganizationQualityReport|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const refresh=()=>setAttempt(value=>value+1);
    window.addEventListener('organization-quality-updated',refresh);window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener('organization-quality-updated',refresh);window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError(false);setReport(null);
    getOrganizationQuality(kind,id,controller.signal).then(value=>{if(!controller.signal.aborted)setReport(value);})
      .catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[kind,id,refreshTrigger,attempt]);
  return <section className="ds-card quality-panel organization-quality-report" aria-label="Qualidade conforme a organização">
    <h4>Qualidade conforme a organização</h4>
    {loading && <p role="status">Avaliando verificações…</p>}
    {error && <p role="alert">Não foi possível consultar a qualidade.</p>}
    {report && <>
      <p>Configuração atual: versão {report.configuration_version} · Completude: {report.score_completude===null?'Sem verificações aplicáveis':`${report.score_completude}%`}</p>
      {report.completion && <div role="note">
        {report.completion.configuration_version===null
          ? <p>Conclusão anterior ao registro das avaliações. Os critérios utilizados não foram registrados.</p>
          : <><p>Concluído com a configuração versão {report.completion.configuration_version}{report.completion.evaluated_at?` em ${new Date(report.completion.evaluated_at).toLocaleString('pt-BR')}`:''}.</p>
            {report.completion.previous_criteria && <p>Este item permanece concluído por critérios anteriores. O indicador acima usa a configuração atual.</p>}
            {report.completion.configuration && <details><summary>Critérios usados na conclusão</summary><ul>{Object.entries(report.completion.configuration.levels[kind]).map(([check,enabled])=><li key={check}>{check.replace(/_/g,' ')}: {enabled?'ativo':'desativado'}</li>)}</ul><p>Termos vagos: {report.completion.configuration.vague_terms.join(', ') || 'Nenhum'}</p></details>}
          </>}
      </div>}
      <ul>{report.checks.map(check=><li key={check.check_id}><strong>{check.passed?'Atendido':'Pendente'} — {check.check_name}</strong><p>{check.message}</p></li>)}</ul>
    </>}
    <Button variant="secondary" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Atualizar qualidade</Button>
  </section>;
}
