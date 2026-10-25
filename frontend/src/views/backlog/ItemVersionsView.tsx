import { useEffect, useRef, useState } from 'react';
import { compareItemVersions, listItemVersions, type ItemKind, type ItemVersion, type VersionComparison } from '../../api/api_versions';
import { Button } from '../common/ui';
import '../../assets/styles/item-versions.css';

const labels: Record<string, string> = {
  titulo: 'Título', descricao: 'Descrição', objetivo: 'Objetivo', escopo_macro: 'Escopo macro',
  resultado_esperado: 'Resultado esperado', historia_como_um: 'COMO UM', historia_eu_quero: 'EU QUERO',
  historia_para_que: 'PARA QUE', regras_observacoes: 'Regras e observações', prioridade: 'Prioridade',
  tipo: 'Tipo', status: 'Status', requer_interface: 'Exige interface', criterios: 'Critérios de aceitação',
  tecnologias: 'Tecnologias', provenance: 'Origem', provenance_json: 'Origem dos campos', codigo: 'Código',
  nome: 'Nome', texto: 'Texto', dado: 'DADO', quando: 'QUANDO', entao: 'ENTÃO', ordem: 'Ordem',
};
function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="muted">Não informado</span>;
  if (typeof value === 'boolean') return <>{value ? 'Sim' : 'Não'}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item,index)=><li key={index}><Value value={item} /></li>)}</ul> : <>Nenhum</>;
  if (typeof value === 'object') return <dl>{Object.entries(value).filter(([key])=>key!=='id').map(([key,item])=><div key={key}><dt>{labels[key] ?? key.replace(/_/g,' ')}</dt><dd><Value value={item} /></dd></div>)}</dl>;
  return <>{String(value)}</>;
}
export function ItemVersionsView({ kind, id, refreshTrigger = 0 }: { kind: ItemKind; id: string; refreshTrigger?: number }) {
  const [items,setItems] = useState<ItemVersion[]>([]);
  const [next,setNext] = useState<number | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [from,setFrom] = useState('');
  const [to,setTo] = useState('');
  const [comparison,setComparison] = useState<VersionComparison | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(()=>{
    request.current?.abort();
    const controller = new AbortController(); request.current=controller;
    setBusy(true); setError(''); setItems([]); setNext(null); setComparison(null); setFrom(''); setTo('');
    listItemVersions(kind,id,controller.signal).then(page=>{
      if (!controller.signal.aborted) { setItems(page.items); setNext(page.next_before); }
    }).catch(()=>{ if (!controller.signal.aborted) setError('Não foi possível carregar as versões.'); })
      .finally(()=>{ if (!controller.signal.aborted) setBusy(false); });
    return ()=>{ request.current?.abort(); };
  },[kind,id,refreshTrigger,attempt]);

  async function run(action: 'more' | 'compare') {
    if (busy) return;
    const controller = new AbortController(); request.current?.abort(); request.current=controller;
    setBusy(true); setError('');
    try {
      if (action==='more' && next) {
        const page=await listItemVersions(kind,id,controller.signal,next);
        if (!controller.signal.aborted) { setItems(current=>[...current,...page.items.filter(row=>!current.some(item=>item.id===row.id))]); setNext(page.next_before); }
      } else if (action==='compare') {
        setComparison(null);
        const result=await compareItemVersions(kind,id,Number(from),Number(to),controller.signal);
        if (!controller.signal.aborted) setComparison(result);
      }
    } catch { if (!controller.signal.aborted) setError('Não foi possível concluir a consulta. Tente novamente.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const option = (item: ItemVersion)=>`Versão ${item.versao} · ${item.autor_nome ?? 'Autoria não registrada'} · ${new Date(item.created_at).toLocaleString('pt-BR')}`;
  return <section className="item-versions" aria-label="Histórico de versões" aria-busy={busy}>
    <h4>Versões da especificação</h4>
    <p className="muted">Snapshots preservam os campos, critérios e tecnologias de cada alteração registrada.</p>
    {busy && <p role="status">Consultando versões…</p>}
    {error && <div role="alert">{error} <Button variant="secondary" disabled={busy} onClick={()=>setAttempt(value=>value+1)}>Recarregar versões</Button></div>}
    {!busy && !error && !items.length && <p>Nenhuma versão registrada para este item.</p>}
    {!!items.length && <>
      <ol className="version-list">{items.map(item=><li key={item.id}>
        <strong>Versão {item.versao}</strong><span>{item.autor_nome ?? 'Autoria não registrada'}</span>
        <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
        {item.acao==='REFERENCIA_INICIAL' && <small>Referência atual registrada na implantação; não reconstrói edições anteriores.</small>}
        {item.justificativa && <p>{item.justificativa}</p>}
      </li>)}</ol>
      {next && <Button variant="secondary" disabled={busy} onClick={()=>run('more')}>Carregar mais versões</Button>}
      {items.length>1 && <form className="version-controls" onSubmit={event=>{ event.preventDefault(); void run('compare'); }}>
        <label>Versão de origem<select value={from} disabled={busy} onChange={event=>{setFrom(event.target.value);setComparison(null);}}><option value="">Selecione</option>{items.map(item=><option key={item.id} value={item.versao}>{option(item)}</option>)}</select></label>
        <label>Versão de destino<select value={to} disabled={busy} onChange={event=>{setTo(event.target.value);setComparison(null);}}><option value="">Selecione</option>{items.map(item=><option key={item.id} value={item.versao}>{option(item)}</option>)}</select></label>
        <Button type="submit" disabled={busy || !from || !to || from===to}>Comparar versões</Button>
      </form>}
    </>}
    {comparison && <div aria-label="Comparação de versões" aria-live="polite">
      <h5>Versão {comparison.anterior.versao} → Versão {comparison.nova.versao}</h5>
      {!comparison.campos.length ? <p>Nenhum campo diferente entre estas versões.</p> : <div className="version-diff">{comparison.campos.map(change=><article key={change.campo}>
        <h5>{labels[change.campo] ?? change.campo.replace(/_/g,' ')}</h5>
        <div className="version-diff-values"><div><strong>Antes</strong><div><Value value={change.anterior} /></div></div><div><strong>Depois</strong><div><Value value={change.novo} /></div></div></div>
      </article>)}</div>}
    </div>}
  </section>;
}
