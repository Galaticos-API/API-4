import { useEffect, useRef, useState } from "react";
import { ApiError } from "../auth/api";
import { navigate } from "./navigation";
import { createPbi, completePbi, getPbi, listPbis, camposFaltantesDe, getPbiQuality, hasCompletudeIndicator, type Pbi, type PbiInput, type QualityReport } from "./api";
import { descreverCamposFaltantes } from "./fields";
import "../projects/projects.css";

type ListResult = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; pbis: Pbi[] };
const emptyInput: PbiInput = { feature_id: "", titulo: "", historia_como_um: "", historia_eu_quero: "", historia_para_que: "" };

export function PbiList({ projectId, epicoId, featureId, canCreate }: { projectId: string; epicoId: string; featureId: string; canCreate: boolean }) {
  const [result, setResult] = useState<ListResult>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listPbis(featureId, controller.signal)
      .then((pbis) => { if (!controller.signal.aborted) setResult({ state: "ready", pbis }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 401 ? "É necessário entrar para acessar os PBIs." : "Não foi possível carregar os PBIs." });
      });
    return () => controller.abort();
  }, [featureId, attempt]);

  const newPath = `/projects/${projectId}/epics/${epicoId}/features/${featureId}/pbis/new`;

  const getCompletudeColor = (score: number) => {
    if (score >= 80) return "badge-success";
    if (score >= 50) return "badge-warning";
    return "badge-error";
  };

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">PBIs da feature</p><h3>Product Backlog Items</h3></div>
        {canCreate && <button className="btn-primary" onClick={() => navigate(newPath)}>Novo PBI</button>}
      </div>
      {result.state === "loading" && <div className="glass-panel projects-state" role="status">Carregando PBIs…</div>}
      {result.state === "error" && <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
        <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>}
      {result.state === "ready" && (result.pbis.length === 0
        ? <div className="glass-panel projects-state"><h4>Nenhum PBI cadastrado</h4><p>Cadastre o primeiro comportamento testável desta feature.</p>
          {canCreate && <button className="btn-primary" onClick={() => navigate(newPath)}>Criar primeiro PBI</button>}</div>
        : <div className="projects-grid">{result.pbis.map((pbi) => (
          <article className="glass-panel project-card" key={pbi.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <span className={`badge ${pbi.status === "concluido" ? "badge-success" : "badge-warning"}`}>{pbi.status}</span>
              {hasCompletudeIndicator(pbi.score_completude) && (
                <span className={`badge ${getCompletudeColor(pbi.score_completude ?? 0)}`}>
                  {pbi.score_completude}% completo
                </span>
              )}
            </div>
            <h4>{pbi.codigo} — {pbi.titulo}</h4>
            <p className="project-excerpt">{pbi.historia_eu_quero || "Sem intenção registrada."}</p>
            <button className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/${featureId}/pbis/${pbi.id}`)}>Ver PBI</button>
          </article>
        ))}</div>)}
    </section>
  );
}

export function PbiForm({ projectId, epicoId, featureId }: { projectId: string; epicoId: string; featureId: string }) {
  const [values, setValues] = useState<PbiInput>({ ...emptyInput, feature_id: featureId });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const featurePath = `/projects/${projectId}/epics/${epicoId}/features/${featureId}`;

  return (
    <section className="projects-page">
      <div className="projects-heading"><div><p className="projects-eyebrow">PBIs / Novo PBI</p><h2>Criar PBI</h2>
        <p>O título e os três blocos da história são obrigatórios. O código é gerado automaticamente.</p></div></div>
      <form className="glass-panel project-form" noValidate aria-busy={busy} onSubmit={async (event) => {
        event.preventDefault();
        if (submitting.current) return;
        const faltando = (["titulo", "historia_como_um", "historia_eu_quero", "historia_para_que"] as const).find((field) => !values[field].trim());
        if (faltando) { setMessage("Preencha o título e os três blocos da história antes de confirmar."); return; }
        submitting.current = true; setBusy(true); setMessage("");
        try {
          const pbi = await createPbi({ ...values, feature_id: featureId });
          if (mounted.current) navigate(`${featurePath}/pbis/${pbi.id}`);
        } catch (error) {
          if (!mounted.current) return;
          setMessage(error instanceof ApiError && error.status === 404 ? "Feature não encontrada." : "Não foi possível criar o PBI. Tente novamente.");
        } finally {
          submitting.current = false;
          if (mounted.current) setBusy(false);
        }
      }}>
        <div className="project-field">
          <label htmlFor="titulo">Título (obrigatório, verbo no infinitivo)</label>
          <input id="titulo" name="titulo" type="text" disabled={busy} value={values.titulo} onChange={(e) => setValues((v) => ({ ...v, titulo: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_como_um">COMO UM (obrigatório)</label>
          <input id="historia_como_um" name="historia_como_um" type="text" disabled={busy} value={values.historia_como_um} onChange={(e) => setValues((v) => ({ ...v, historia_como_um: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_eu_quero">EU QUERO (obrigatório)</label>
          <input id="historia_eu_quero" name="historia_eu_quero" type="text" disabled={busy} value={values.historia_eu_quero} onChange={(e) => setValues((v) => ({ ...v, historia_eu_quero: e.target.value }))} />
        </div>
        <div className="project-field">
          <label htmlFor="historia_para_que">PARA QUE (obrigatório)</label>
          <input id="historia_para_que" name="historia_para_que" type="text" disabled={busy} value={values.historia_para_que} onChange={(e) => setValues((v) => ({ ...v, historia_para_que: e.target.value }))} />
        </div>
        {message && <p role="alert">{message}</p>}
        <div className="project-actions">
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Criando…" : "Criar PBI"}</button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => navigate(featurePath)}>Voltar à feature</button>
        </div>
      </form>
    </section>
  );
}

export function PbiDetail({ projectId, epicoId, featureId, pbiId }: { projectId: string; epicoId: string; featureId: string; pbiId: string }) {
  const [result, setResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; pbi: Pbi }>({ state: "loading" });
  const [qualityResult, setQualityResult] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; quality: QualityReport }>({ state: "loading" });
  const [completing, setCompleting] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    getPbi(pbiId, controller.signal)
      .then((pbi) => { if (!controller.signal.aborted) setResult({ state: "ready", pbi }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setResult({ state: "error", message: error instanceof ApiError && error.status === 404 ? "PBI não encontrado." : "Não foi possível carregar o PBI." });
      });
    return () => controller.abort();
  }, [pbiId, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setQualityResult({ state: "loading" });
    getPbiQuality(pbiId, controller.signal)
      .then((quality) => { if (!controller.signal.aborted) setQualityResult({ state: "ready", quality }); })
      .catch(() => {
        if (controller.signal.aborted) return;
        setQualityResult({ state: "error", message: "Não foi possível carregar o relatório de qualidade." });
      });
    return () => controller.abort();
  }, [pbiId, attempt]);

  if (result.state === "loading") return <div className="glass-panel projects-state" role="status">Carregando PBI…</div>;
  if (result.state === "error") return <div className="glass-panel projects-state"><p role="alert">{result.message}</p>
    <button className="btn-secondary" onClick={() => setAttempt((v) => v + 1)}>Tentar novamente</button></div>;

  const { pbi } = result;

  const getCompletudeColor = (score: number) => {
    if (score >= 80) return "badge-success";
    if (score >= 50) return "badge-warning";
    return "badge-error";
  };

  return (
    <section className="projects-page">
      <div className="projects-heading">
        <div><p className="projects-eyebrow">Feature: {pbi.feature_titulo}</p><h2>{pbi.codigo} — {pbi.titulo}</h2></div>
        <button className="btn-secondary" onClick={() => navigate(`/projects/${projectId}/epics/${epicoId}/features/${featureId}`)}>Voltar à feature de origem</button>
      </div>
      <article className="glass-panel project-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", marginBottom: "16px" }}>
          <span className={`badge ${pbi.status === "concluido" ? "badge-success" : "badge-warning"}`}>{pbi.status}</span>
          {hasCompletudeIndicator(pbi.score_completude) && (
            <span className={`badge ${getCompletudeColor(pbi.score_completude ?? 0)}`}>
              {pbi.score_completude}% completo
            </span>
          )}
        </div>
        <dl>
          <dt>COMO UM</dt><dd>{pbi.historia_como_um}</dd>
          <dt>EU QUERO</dt><dd>{pbi.historia_eu_quero}</dd>
          <dt>PARA QUE</dt><dd>{pbi.historia_para_que}</dd>
          <dt>Cenários de aceitação registrados</dt><dd>{pbi.criterios_count}</dd>
        </dl>
        {qualityResult.state === "ready" && qualityResult.quality.score_completude !== null && (
          <div style={{ marginTop: "20px", padding: "16px", background: "rgba(0, 0, 0, 0.2)", borderRadius: "8px" }}>
            <h4 style={{ marginBottom: "12px", fontSize: "0.9rem", fontWeight: 600 }}>Relatório de Qualidade</h4>
            <div style={{ marginBottom: "12px" }}>
              <strong>Completude: {qualityResult.quality.score_completude}%</strong>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {qualityResult.quality.checks.map((check) => (
                <li key={check.check_id} style={{ 
                  padding: "8px", 
                  marginBottom: "8px", 
                  background: check.passed ? "rgba(76, 175, 80, 0.1)" : "rgba(244, 67, 54, 0.1)",
                  borderRadius: "4px",
                  borderLeft: `3px solid ${check.passed ? "#4CAF50" : "#F44336"}`
                }}>
                  <div style={{ fontWeight: 500, marginBottom: "4px" }}>
                    {check.passed ? "✓" : "✗"} {check.check_name}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    {check.message}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pbi.status === "rascunho" && (
          <div className="project-actions">
            <button className="btn-primary" disabled={completing} onClick={async () => {
              setCompleting(true); setCompletionMessage("");
              try {
                const completed = await completePbi(pbi.id);
                setResult({ state: "ready", pbi: completed });
                setAttempt((v) => v + 1); // Reload quality report
              } catch (error) {
                const campos = camposFaltantesDe(error);
                setCompletionMessage(campos ? `Faltam preencher: ${descreverCamposFaltantes(campos)}.` : "Não foi possível concluir o PBI.");
              } finally {
                setCompleting(false);
              }
            }}>{completing ? "Concluindo…" : "Marcar como concluído"}</button>
          </div>
        )}
        {completionMessage && <p role="alert">{completionMessage}</p>}
      </article>
    </section>
  );
}
