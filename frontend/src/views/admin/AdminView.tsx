import { Button } from "../common/ui";
import React, { useState, useEffect } from "react";
import { listProjects, type Project } from "../../api/api_projects";
import { ApiError, apiRequest } from "../../api/api_auth";

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
    </div>
  );
};
