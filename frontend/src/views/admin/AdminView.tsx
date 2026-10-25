import { Button } from "../common/ui";
import React, { useState, useEffect } from "react";
import { listProjects, type Project } from "../../api/api_projects";
import { ApiError, apiRequest } from "../../api/api_auth";
import { navigate } from "../../models/navigation";
import { OrganizationQualitySettings } from './OrganizationQualitySettings';

interface Stats {
  projetos: number;
  epicos: number;
  features: number;
  pbis: number;
  documentos: number;
  chunksIndexados: number;
  statusSistema: string;
}

export const AdminView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadStats = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest("/admin/stats");
      const data = await res.json();
      setStats(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar métricas administrativas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
    const controller = new AbortController();
    async function loadProjects() {
      try {
        const items: Project[] = [];
        let offset = 0;
        while (!controller.signal.aborted) {
          const page = await listProjects(controller.signal, offset);
          items.push(...page.projects.filter(project => project.status !== "arquivado"));
          offset += page.limit;
          if (offset >= page.total) break;
        }
        if (!controller.signal.aborted) setProjects(items);
      } catch {
        if (!controller.signal.aborted) setError("Não foi possível carregar os projetos de destino. Atualize a página para tentar novamente.");
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    }
    void loadProjects();
    return () => controller.abort();
  }, []);

  const handleLoadDemo = async () => {
    if (!projectId || ingesting) return;
    setIngesting(true);
    setMessage("Carregando exemplos no projeto selecionado...");
    setError("");

    try {
      const res = await apiRequest("/admin/demo-seed", { method: "POST", body: JSON.stringify({ projeto_id: projectId }) });
      const data = await res.json();

      setMessage(data.message || "Dados demonstrativos carregados.");
      void loadStats();
    } catch (err: unknown) {
      const details = err instanceof ApiError ? err.details as { error?: string } | undefined : undefined;
      setError(details?.error ?? "Não foi possível carregar os dados demonstrativos.");
      setMessage("");
    } finally {
      setIngesting(false);
    }
  };

  const [purgeProjectId, setPurgeProjectId] = useState("");
  const [purgeConfirmName, setPurgeConfirmName] = useState("");
  const [purgeJustification, setPurgeJustification] = useState("");
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState("");
  const [purgeError, setPurgeError] = useState("");

  const selectedPurgeProject = projects.find(p => p.id === purgeProjectId);

  const handlePurgeProject = async () => {
    if (!purgeProjectId || purging) return;
    const selected = projects.find(p => p.id === purgeProjectId);
    if (!selected) return;

    if (purgeConfirmName.trim() !== selected.nome.trim()) {
      setPurgeError("O nome informado não confere com o nome do projeto.");
      return;
    }

    setPurging(true);
    setPurgeMessage("");
    setPurgeError("");

    try {
      const res = await apiRequest(`/admin/projects/${purgeProjectId}/purge`, {
        method: "POST",
        body: JSON.stringify({
          confirmacao_nome: purgeConfirmName.trim(),
          justificativa: purgeJustification.trim() || undefined,
        }),
      });
      const data = await res.json();
      setPurgeMessage(data.message || `Contexto indexado de "${selected.nome}" expurgado; documentos pendentes de reindexação foram cancelados.`);
      setPurgeConfirmName("");
      setPurgeJustification("");
      void loadStats();
    } catch (err: unknown) {
      const details = err instanceof ApiError ? (err.details as { message?: string; error?: string } | undefined) : undefined;
      setPurgeError(details?.message ?? details?.error ?? (err instanceof Error ? err.message : "Não foi possível expurgar o contexto do projeto."));
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">OPERAÇÃO & GOVERNANÇA</div>
          <h1>Administração & Carga Inicial do Acervo</h1>
          <p className="muted">
            Acompanhe os dados do sistema e carregue exemplos em um projeto escolhido.
          </p>
        </div>
        <Button onClick={() => navigate("/admin/ingestion")}>
          Pipeline de ingestão
        </Button>
      </div>

      {message && (
        <div role="status" className="ds-card" style={{ background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)", margin: "16px 0", color: "#93c5fd" }}>
          {message}
        </div>
      )}

      {error && (
        <div role="alert" className="ds-card" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", margin: "16px 0", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      <OrganizationQualitySettings />
      {/* Grid de Estatísticas */}
      <div className="ds-grid ds-grid--three" style={{ marginTop: "20px" }}>
        <article className="ds-card">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Projetos no Banco</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "var(--brand-primary)" }}>
            {loading ? "..." : stats?.projetos ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Espaços de trabalho cadastrados</p>
        </article>

        <article className="ds-card">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Requisitos & PBIs</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "#fff" }}>
            {loading ? "..." : stats?.pbis ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>PBIs com critérios em BDD</p>
        </article>

        <article className="ds-card">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Trechos com vetor</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "#34d399" }}>
            {loading ? "..." : stats?.chunksIndexados ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Somente trechos com embedding armazenado</p>
        </article>
      </div>

      {/* Painel de Ações Administrativas */}
      <div className="ds-card" style={{ marginTop: "24px", padding: "24px" }}>
        <h3>Operações de Acervo</h3>
        <p className="muted" style={{ margin: "8px 0 20px" }}>
          Adicione dois exemplos identificados como demonstração ao projeto escolhido. Repetir a ação não duplica os exemplos. Esta operação não indexa documentos nem gera vetores.
        </p>

        <div className="ds-field ds-field--spaced">
          <label htmlFor="demo-project">Projeto de destino</label>
          <select id="demo-project" className="ds-input" value={projectId} onChange={event => setProjectId(event.target.value)} disabled={projectsLoading || ingesting}>
            <option value="">{projectsLoading ? "Carregando projetos…" : "Selecione um projeto"}</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.nome}</option>)}
          </select>
          {!projectsLoading && projects.length === 0 && <p>Crie um projeto ativo para receber os exemplos.</p>}
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Button variant="primary" onClick={handleLoadDemo} disabled={ingesting || projectsLoading || !projectId}>
            {ingesting ? "Carregando exemplos..." : "Carregar demonstração"}
          </Button>
          <Button variant="secondary" onClick={loadStats} disabled={loading}>
            Atualizar Métricas
          </Button>
        </div>
      </div>

      {/* Painel de Expurgo de Contexto (S2-05) */}
      <div className="ds-card" style={{ marginTop: "24px", padding: "24px", borderColor: "rgba(239, 68, 68, 0.4)" }}>
        <h3 style={{ color: "#f87171" }}>Expurgo de Contexto do Projeto</h3>
        <p className="muted" style={{ margin: "8px 0 16px" }}>
          Operação destrutiva e irreversível: o expurgo remove todo o conteúdo indexado (trechos e vetores do acervo) e a fila de indexação do projeto selecionado. Os demais projetos permanecem intactos.
        </p>

        {purgeMessage && (
          <div role="status" className="ds-card" style={{ background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)", margin: "16px 0", color: "#93c5fd" }}>
            {purgeMessage}
          </div>
        )}

        {purgeError && (
          <div role="alert" className="ds-card" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", margin: "16px 0", color: "#fca5a5" }}>
            {purgeError}
          </div>
        )}

        <div className="ds-field ds-field--spaced">
          <label htmlFor="purge-project">Projeto para expurgo</label>
          <select
            id="purge-project"
            className="ds-input"
            value={purgeProjectId}
            onChange={event => {
              setPurgeProjectId(event.target.value);
              setPurgeConfirmName("");
              setPurgeError("");
              setPurgeMessage("");
            }}
            disabled={projectsLoading || purging}
          >
            <option value="">{projectsLoading ? "Carregando projetos…" : "Selecione o projeto a expurgar"}</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.nome}</option>)}
          </select>
        </div>

        {selectedPurgeProject && (
          <>
            <div className="ds-field ds-field--spaced" style={{ marginTop: "16px" }}>
              <label htmlFor="purge-confirm-name">
                Digite exatamente o nome do projeto (<strong>{selectedPurgeProject.nome}</strong>) para confirmar:
              </label>
              <input
                id="purge-confirm-name"
                type="text"
                className="ds-input"
                placeholder={selectedPurgeProject.nome}
                value={purgeConfirmName}
                onChange={event => setPurgeConfirmName(event.target.value)}
                disabled={purging}
              />
            </div>

            <div className="ds-field ds-field--spaced" style={{ marginTop: "16px" }}>
              <label htmlFor="purge-justification">Justificativa (opcional):</label>
              <input
                id="purge-justification"
                type="text"
                className="ds-input"
                placeholder="Ex: Refazer carga de dados ou exigência de exclusão"
                value={purgeJustification}
                onChange={event => setPurgeJustification(event.target.value)}
                disabled={purging}
              />
            </div>
          </>
        )}

        <div style={{ marginTop: "20px" }}>
          <Button
            variant="secondary"
            onClick={handlePurgeProject}
            disabled={purging || projectsLoading || !purgeProjectId || !selectedPurgeProject || purgeConfirmName.trim() !== selectedPurgeProject.nome.trim()}
            style={{ borderColor: "#ef4444", color: "#f87171" }}
          >
            {purging ? "Expurgando contexto..." : "Expurgar contexto do projeto"}
          </Button>
        </div>
      </div>
    </div>
  );
};

