import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/api_auth';
import { getOrganizationConfiguration, getQualityHistory, saveOrganizationConfiguration, type OrganizationConfiguration, type Level } from '../../api/api_organization_quality';
import { Button } from '../common/ui';
import '../../assets/styles/organization-quality.css';

const levelNames:Record<Level,string>={epico:'Épico',feature:'Feature',pbi:'PBI'};
const checkNames:Record<string,string>={campos_obrigatorios:'Campos obrigatórios do guia',criterios_aceitacao:'Critérios de aceitação registrados',termos_vagos:'Ausência de termos vagos',titulo_infinitivo:'Título com verbo no infinitivo',historia_completa:'História do usuário completa',cenario_estruturado:'Cenários estruturados',prototipo_vinculado:'Protótipo associado quando exige interface'};

export function OrganizationQualitySettings() {
  const [config,setConfig]=useState<OrganizationConfiguration|null>(null);
  const [terms,setTerms]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [history,setHistory]=useState<OrganizationConfiguration[]>([]);
  const [next,setNext]=useState<number|null>(null);
  const historyRequest=useRef<AbortController|null>(null);
  const mounted=useRef(false);

  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;historyRequest.current?.abort();};},[]);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError('');setMessage('');
    Promise.all([getOrganizationConfiguration(controller.signal),getQualityHistory(controller.signal)]).then(([current,page])=>{
      if(!controller.signal.aborted){setConfig(current);setTerms(current.vague_terms.join('\n'));setHistory(page.items);setNext(page.next_before);}
    }).catch(()=>{if(!controller.signal.aborted)setError('Não foi possível carregar a configuração de qualidade.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[attempt]);

  async function save(event:React.FormEvent) {
    event.preventDefault();if(!config || busy)return;
    setBusy(true);setError('');setMessage('');
    try {
      const updated=await saveOrganizationConfiguration(config,terms.split(/\r?\n/).map(term=>term.trim()).filter(Boolean));
      if(!mounted.current)return;
      setConfig(updated);setTerms(updated.vague_terms.join('\n'));setHistory(current=>[updated,...current]);
      setMessage('Configuração salva. As próximas avaliações já usam as novas verificações.');
    } catch(error) {
      if(mounted.current)setError(error instanceof ApiError && error.status===409
        ? 'Outra pessoa alterou a configuração. Recarregue e confira as mudanças antes de salvar.'
        : 'Não foi possível salvar. Use até 100 termos distintos de no máximo 80 caracteres cada. Suas alterações foram mantidas.');
    } finally {if(mounted.current)setBusy(false);}
  }
  async function more() {
    if(!next || busy || loading)return;
    const controller=new AbortController();historyRequest.current=controller;
    setBusy(true);setError('');
    try {
      const page=await getQualityHistory(controller.signal,next);
      if(!controller.signal.aborted){setHistory(current=>[...current,...page.items.filter(row=>!current.some(item=>item.version===row.version))]);setNext(page.next_before);}
    } catch {if(!controller.signal.aborted)setError('Não foi possível carregar o histórico.');}
    finally {if(!controller.signal.aborted)setBusy(false);}
  }
  return <section className="ds-card organization-quality-settings" aria-label="Configuração de qualidade da organização">
    <h2>Qualidade da organização</h2>
    <p className="muted">Defina as verificações de cada nível. Verificações desativadas não entram no indicador de completude. Itens concluídos mantêm o estado e o registro dos critérios de conclusão.</p>
    {loading && <p role="status">Carregando configuração…</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    <Button variant="secondary" disabled={loading||busy} onClick={()=>setAttempt(value=>value+1)}>Recarregar configuração</Button>
    {config && !loading && <form onSubmit={save}>
      <p>Versão {config.version} · {config.updated_by?.nome ?? 'Padrão da instalação'} · {new Date(config.updated_at).toLocaleString('pt-BR')}</p>
      <div className="organization-quality-levels">{(['epico','feature','pbi'] as const).map(level=><fieldset key={level} disabled={busy}>
        <legend>{levelNames[level]}</legend>
        {Object.entries(config.levels[level]).map(([check,enabled])=><label key={check}>
          <input type="checkbox" checked={enabled} onChange={event=>setConfig(current=>current?{...current,levels:{...current.levels,[level]:{...current.levels[level],[check]:event.target.checked}}}:current)} />
          {checkNames[check] ?? check}
        </label>)}
      </fieldset>)}</div>
      <label className="organization-quality-terms">Termos vagos (um por linha)<textarea rows={7} value={terms} disabled={busy} onChange={event=>setTerms(event.target.value)} /></label>
      <label className="organization-quality-policy"><input type="checkbox" disabled={busy} checked={config.exigir_justificativa_item_concluido} onChange={event=>setConfig({...config,exigir_justificativa_item_concluido:event.target.checked})} />Exigir justificativa ao editar itens concluídos</label>
      <Button type="submit" disabled={busy}>{busy?'Salvando…':'Salvar verificações'}</Button>
    </form>}
    {!!history.length && <details><summary>Histórico das configurações</summary><ol>{history.map(row=><li key={row.version}>Versão {row.version} · {row.updated_by?.nome ?? 'Padrão da instalação'} · <time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString('pt-BR')}</time></li>)}</ol>{next && <Button variant="secondary" disabled={busy||loading} onClick={more}>Carregar mais configurações</Button>}</details>}
  </section>;
}
