import { Button } from "../common/ui";
import React, { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../../api/api_auth";
import { SearchField } from "../common/SearchField";

interface SearchItem {
  id: string;
  projeto_id: string;
  projeto_nome?: string;
  entidade_tipo: string;
  entidade_id: string;
  texto: string;
  metadados_json: Record<string, unknown>;
  created_at: string;
}

interface ProjectOption {
  id: string;
  nome: string;
}

export const KnowledgeView: React.FC = () => {
  const [query, setQuery] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Carrega projetos reais do backend para o filtro de escopo
  useEffect(() => {
    apiRequest("/projects")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.items)) {
          setProjects(data.items.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })));
        }
      })
      .catch(() => {
        // Trata erro de rede sem quebrar o componente
      });
  }, []);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.append("q", query.trim());
      if (selectedProject) params.append("projeto_id", selectedProject);

      const res = await apiRequest(`/search?${params.toString()}`);
      const data = await res.json();
      setResults(data.items || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, selectedProject]);

  useEffect(() => {
    void handleSearch();
  }, [selectedProject, handleSearch]);

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">BASE INTELIGENTE DE REQUISITOS</div>
          <h1>Consulta de Conhecimento do Acervo</h1>
          <p className="muted">
            Recupere decisões arquiteturais, especificações de PBIs e documentos indexados no repositório PostgreSQL + pgvector.
          </p>
        </div>
      </div>

      <div className="ds-card" style={{ marginTop: "16px", padding: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 240px auto", gap: "16px", alignItems: "flex-end" }}>
          <SearchField
            label="Pesquisar no acervo"
            value={query}
            onChange={setQuery}
            placeholder="Ex: autenticação JWT, integração PIX, regras de completude..."
          />

          <div className="ds-field ds-field--spaced" style={{ margin: 0 }}>
            <label htmlFor="select-project-scope">Escopo do Projeto</label>
            <select
              id="select-project-scope"
              className="ds-input"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">Todos os Projetos</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <Button variant="primary" onClick={handleSearch} disabled={loading} style={{ height: "42px" }}>
            {loading ? "Buscando..." : "Pesquisar"}
          </Button>
        </div>
      </div>

      {/* Resultados */}
      <div style={{ marginTop: "24px" }}>
        {loading ? (
          <div className="ds-card" role="status" style={{ textAlign: "center", padding: "32px" }}>
            Consultando acervo indexado do banco de dados...
          </div>
        ) : results.length === 0 ? (
          <div className="ds-card" style={{ textAlign: "center", padding: "48px 24px" }}>
            <h3>{searched ? "Nenhum resultado encontrado" : "Digite um termo para pesquisar"}</h3>
            <p className="muted">
              {searched
                ? "Tente refinar sua busca ou selecione outro projeto no filtro de escopo."
                : "Busque por conceitos, tecnologias ou regras de negócio cadastradas nos projetos."}
            </p>
          </div>
        ) : (
          <div className="ds-grid ds-grid--one" style={{ gap: "16px" }}>
            {results.map((item) => (
              <article className="ds-card" key={item.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="ds-badge ds-badge--success">{item.entidade_tipo}</span>
                    {item.projeto_nome && <span className="muted" style={{ fontSize: "0.85rem" }}>Projeto: {item.projeto_nome}</span>}
                  </div>
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>

                <p style={{ color: "#fff", fontSize: "0.95rem", lineHeight: 1.6, margin: "0 0 12px 0", whiteSpace: "pre-wrap" }}>
                  {item.texto}
                </p>

                {item.metadados_json && Object.keys(item.metadados_json).length > 0 && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", background: "rgba(0,0,0,0.2)", padding: "8px 12px", borderRadius: "6px" }}>
                    Origem: {JSON.stringify(item.metadados_json)}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
