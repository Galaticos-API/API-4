import { useEffect,useState } from 'react';
import { getWorkDefinitions,type WorkDefinitions,type WorkLevel } from '../../api/api_work_definitions';
import { Button } from '../common/ui';
import '../../assets/styles/organization-quality.css';

export function WorkDefinitionsPanel({level}:{level:WorkLevel}) {
  const [config,setConfig]=useState<WorkDefinitions|null>(null);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const refresh=()=>setAttempt(value=>value+1);
    window.addEventListener('work-definitions-updated',refresh);
    window.addEventListener('focus',refresh);
    return()=>{window.removeEventListener('work-definitions-updated',refresh);window.removeEventListener('focus',refresh);};
  },[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError(false);setConfig(null);
    getWorkDefinitions(controller.signal).then(value=>{if(!controller.signal.aborted)setConfig(value);})
      .catch(()=>{if(!controller.signal.aborted)setError(true);})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[attempt]);
  return <section className="ds-card organization-quality-settings work-definitions-panel" aria-label="Definições de Preparado e Pronto">
    <h4>Definições de Preparado e Pronto</h4>
    <p className="muted">Orientações da organização para este nível. Estas condições não alteram as verificações automáticas nem bloqueiam a conclusão.</p>
    {loading && <p role="status">Carregando definições…</p>}
    {error && <p role="alert">Não foi possível consultar as definições. Sua edição foi mantida.</p>}
    {config && <>
      <p className="muted">Versão {config.version}</p>
      <div className="organization-quality-levels">{(['dor','dod'] as const).map(kind=><div key={kind}>
        <h5>{kind==='dor'?'Definição de Preparado (DoR)':'Definição de Pronto (DoD)'}</h5>
        {config.levels[level][kind].length ? <ul>{config.levels[level][kind].map((condition,index)=><li key={index}>{condition}</li>)}</ul>
          : <p>Nenhuma condição cadastrada para este nível.</p>}
      </div>)}</div>
    </>}
    <Button variant="secondary" disabled={loading} onClick={()=>setAttempt(value=>value+1)}>Atualizar definições</Button>
  </section>;
}
