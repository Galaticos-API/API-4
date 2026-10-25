import { useEffect,useMemo,useRef,useState } from 'react';
import { ApiError } from '../../api/api_auth';
import { getWorkDefinitions,saveWorkDefinitions,type WorkDefinitions,type WorkLevel } from '../../api/api_work_definitions';
import { Button } from '../common/ui';
import { useUnsavedChangesGuard } from '../../viewmodels/useUnsavedChangesGuard';
import '../../assets/styles/organization-quality.css';

const levels:WorkLevel[]=['epico','feature','pbi'];
const names={epico:'Épico',feature:'Feature',pbi:'PBI'};
type Draft=Record<WorkLevel,{dor:string;dod:string}>;
const toDraft=(config:WorkDefinitions):Draft=>Object.fromEntries(levels.map(level=>[level,{dor:config.levels[level].dor.join('\n'),dod:config.levels[level].dod.join('\n')}])) as Draft;
export function WorkDefinitionsSettings() {
  const [config,setConfig]=useState<WorkDefinitions|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [attempt,setAttempt]=useState(0);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const mounted=useRef(false);
  const baseline=useMemo(()=>config?toDraft(config):null,[config]);
  const dirty=Boolean(draft&&baseline&&levels.some(level=>draft[level].dor!==baseline[level].dor||draft[level].dod!==baseline[level].dod));
  useUnsavedChangesGuard(dirty);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setMessage('');
    getWorkDefinitions(controller.signal).then(value=>{if(!controller.signal.aborted){setConfig(value);setDraft(toDraft(value));}})
      .catch(()=>{if(!controller.signal.aborted)setError('Não foi possível carregar as definições.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[attempt]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(!config||!draft||saving||loading)return;
    setSaving(true);setError('');setMessage('');
    const split=(value:string)=>value.split(/\r\n|[\r\n\u2028\u2029]/u).map(line=>line.trim()).filter(Boolean);
    const next={...config,levels:Object.fromEntries(levels.map(level=>[level,{dor:split(draft[level].dor),dod:split(draft[level].dod)}])) as WorkDefinitions['levels']};
    try {
      const saved=await saveWorkDefinitions(next);
      if(mounted.current){setConfig(saved);setDraft(toDraft(saved));setMessage('Definições salvas. Os autores já podem consultar as novas condições.');}
    } catch(error) {
      if(mounted.current)setError(error instanceof ApiError&&error.status===409
        ?'Outra pessoa alterou as definições. Recarregue e confira as mudanças antes de salvar.'
        :'Não foi possível salvar. Use até 50 condições distintas por definição, com até 500 caracteres cada. Sua edição foi mantida.');
    } finally {if(mounted.current)setSaving(false);}
  }
  return <section className="ds-card organization-quality-settings" aria-label="Configuração de DoR e DoD">
    <h2>Definições de Preparado e Pronto</h2>
    <p>Cadastre as orientações de cada nível, com uma condição por linha. Deixe vazio para remover as condições. Elas são descritivas e não criam bloqueios automáticos.</p>
    {loading&&<p role="status">Carregando definições…</p>}
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    <Button variant="secondary" disabled={loading||saving} onClick={()=>{
      if(dirty&&!window.confirm('Recarregar as definições descarta as alterações não salvas. Deseja continuar?'))return;
      setAttempt(value=>value+1);
    }}>Recarregar definições</Button>
    {config&&draft&&!loading&&<form onSubmit={save}>
      <p>Versão {config.version} · {config.updated_by_name??'Sem alteração registrada'} · {new Date(config.updated_at).toLocaleString('pt-BR')}</p>
      <div className="organization-quality-levels">{levels.map(level=><fieldset key={level} disabled={saving}>
        <legend>{names[level]}</legend>
        {(['dor','dod'] as const).map(kind=><label className="organization-quality-terms" key={kind}>
          {kind==='dor'?'Definição de Preparado (DoR)':'Definição de Pronto (DoD)'}
          <textarea rows={5} value={draft[level][kind]} onChange={event=>setDraft(current=>current?{...current,[level]:{...current[level],[kind]:event.target.value}}:current)}/>
        </label>)}
      </fieldset>)}</div>
      <Button type="submit" disabled={saving}>{saving?'Salvando definições…':'Salvar definições'}</Button>
    </form>}
  </section>;
}
