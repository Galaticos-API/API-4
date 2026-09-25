import React, { useState, useEffect } from "react";
import { apiRequest } from "../../api/api_auth";
import "../../assets/styles/garakis-prototype.css";

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
  }, []);

  const handleIngestSeed = async () => {
    setIngesting(true);
    setMessage("Disparando reindexação de acervo no backend...");
    setError("");

    try {
      const res = await apiRequest("/admin/ingest-seed", { method: "POST" });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Falha na reindexação");

      setMessage(data.message || "Acervo reindexado com sucesso!");
      void loadStats();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao reindexar acervo.");
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">OPERACIONALE & GOVERNANÇA</div>
          <h1>Administração & Carga Inicial do Acervo</h1>
          <p className="muted">
            Monitore contadores reais de entidades persistidas no PostgreSQL e reindexe o acervo vetorial do repositório.
          </p>
        </div>
      </div>

      {message && (
        <div className="card-garakis" style={{ background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)", margin: "16px 0", color: "#93c5fd" }}>
          {message}
        </div>
      )}

      {error && (
        <div className="card-garakis" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", margin: "16px 0", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {/* Grid de Estatísticas */}
      <div className="grid-garakis three" style={{ marginTop: "20px" }}>
        <article className="card-garakis">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Projetos no Banco</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "var(--orange)" }}>
            {loading ? "..." : stats?.projetos ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Espaços de trabalho cadastrados</p>
        </article>

        <article className="card-garakis">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Requisitos & PBIs</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "#fff" }}>
            {loading ? "..." : stats?.pbis ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>PBIs com critérios em BDD</p>
        </article>

        <article className="card-garakis">
          <span className="muted" style={{ fontSize: "0.85rem" }}>Trechos Indexados (RAG)</span>
          <h2 style={{ fontSize: "2rem", margin: "8px 0", color: "#34d399" }}>
            {loading ? "..." : stats?.chunksIndexados ?? 0}
          </h2>
          <p className="muted" style={{ fontSize: "0.85rem" }}>Vetores bge-m3 no pgvector</p>
        </article>
      </div>

      {/* Painel de Ações Administrativas */}
      <div className="card-garakis" style={{ marginTop: "24px", padding: "24px" }}>
        <h3>Operações de Acervo</h3>
        <p className="muted" style={{ margin: "8px 0 20px" }}>
          Execute a carga inicial dos documentos de referência e reindexação de vetores do ecossistema.
        </p>

        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <button className="btn-garakis primary" onClick={handleIngestSeed} disabled={ingesting}>
            {ingesting ? "Reindexando acervo..." : "⚡ Carga Inicial & Reindexação"}
          </button>
          <button className="btn-garakis secondary" onClick={loadStats} disabled={loading}>
            Atualizar Métricas
          </button>
        </div>
      </div>
    </div>
  );
};
