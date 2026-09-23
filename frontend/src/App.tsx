import React, { useState, useEffect } from "react";
import { isProjectPath, navigate, routes } from "./auth/navigation";
import { useAuth } from "./auth/Auth";
import { Projects } from "./projects/Projects";
import {
  Cpu,
  Layers,
  Sparkles,
  AlertCircle,
  BookOpen,
} from "lucide-react";

interface ServiceStatus {
  name: string;
  category: string;
  port: number;
  status: "online" | "offline" | "checking";
  endpoint: string;
  description: string;
}

export const App: React.FC = () => {
  const { session, logout } = useAuth();
  const [pathname, setPathname] = useState(window.location.pathname);
  const activeTab = isProjectPath(pathname) ? "projects" : (Object.keys(routes) as Array<keyof typeof routes>).find(key => routes[key] === pathname);
  const setActiveTab = (tab: keyof typeof routes) => navigate(routes[tab]);
  useEffect(() => {
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const [backendHealth, setBackendHealth] = useState<string>("checking");
  const [ollamaHealth, setOllamaHealth] = useState<string>("checking");

  const services: ServiceStatus[] = [
    {
      name: "PostgreSQL + pgvector",
      category: "Persistência Vetorial & Relacional",
      port: 5432,
      status: "online",
      endpoint: "localhost:5432",
      description: "Banco unificado com extensão pgvector (HNSW) para tabelas de negócio e embeddings.",
    },
    {
      name: "n8n (Orquestrador)",
      category: "Pipeline & Gatilhos",
      port: 5678,
      status: "online",
      endpoint: "http://localhost:5678",
      description: "Orquestrador de ingestão de documentos em /files e versionamento via n8n-local-sync.",
    },
    {
      name: "Ollama (LLM & Embeddings)",
      category: "Runtime Local de IA",
      port: 11434,
      status: (ollamaHealth === "online" ? "online" : "checking") as any,
      endpoint: "http://localhost:11434",
      description: "Serviço local para inferência de LLM (Qwen 2.5) e geração de vetores (bge-m3).",
    },
    {
      name: "Backend Node.js",
      category: "API & Regras de Negócio",
      port: 3001,
      status: (backendHealth === "online" ? "online" : "checking") as any,
      endpoint: "http://localhost:3001/health",
      description: "CRUD de requisitos, validação determinística e fronteira segura de escrita.",
    },
    {
      name: "Serviço de IA (Python)",
      category: "RAG & Harness",
      port: 8000,
      status: "checking",
      endpoint: "http://localhost:8000/health",
      description: "Fonte única da verdade para chunking, RAG e integração direta com Ollama.",
    },
    {
      name: "Frontend React (Vite)",
      category: "Interface do Product Owner",
      port: 5173,
      status: "online",
      endpoint: "http://localhost:5173",
      description: "SPA em React/TypeScript para catálogo de requisitos, busca e chat assistivo.",
    },
  ];

  useEffect(() => {
    // Check Backend
    fetch("http://localhost:3001/health")
      .then((res) => (res.ok ? setBackendHealth("online") : setBackendHealth("offline")))
      .catch(() => setBackendHealth("offline"));

    // Check Ollama
    fetch("http://localhost:11434/api/tags")
      .then((res) => (res.ok ? setOllamaHealth("online") : setOllamaHealth("offline")))
      .catch(() => setOllamaHealth("offline"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="app-header">
        <div className="app-brand"><span className="app-brand-mark"><Sparkles size={20} /></span><h1>Sinapse</h1></div>
        <nav className="app-nav" aria-label="Navegação principal">
          {([ ["projects", "Projetos", Layers], ["architecture", "Arquitetura", Layers], ["requirements", "Requisitos", BookOpen], ["rag", "Assistente", Cpu] ] as const).map(([id, label, Icon]) => <button key={id} className={activeTab === id ? "active" : ""} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined} title={label}><Icon size={16} /><span className="nav-label"> {label}</span></button>)}
        </nav>
        <div className="app-user"><span className="app-user-name">{session.user?.name}</span><button onClick={() => void logout()} aria-label="Sair">Sair</button></div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "32px", maxWidth: "1280px", margin: "0 auto", width: "100%" }}>
        {activeTab === "projects" && <Projects key={pathname} pathname={pathname} canCreate={session.user?.role === "po" || session.user?.role === "admin"} />}
        {!activeTab && <section><h2>Página não encontrada</h2><button className="btn-primary" onClick={() => navigate("/", true)}>Ir para o início</button></section>}
        {activeTab === "architecture" && (
          <div>
            <div style={{ marginBottom: "28px" }}>
              <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "8px" }}>
                Topologia de Serviços e Microsserviços
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                Visão unificada das 6 camadas da solução configuradas de acordo com a seção 10 do PRD.
              </p>
            </div>

            {/* Service Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
                gap: "20px",
                marginBottom: "36px",
              }}
            >
              {services.map((svc) => (
                <div key={svc.name} className="glass-panel" style={{ padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                    <div>
                      <span style={{ fontSize: "0.75rem", color: "var(--accent-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                        {svc.category}
                      </span>
                      <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginTop: "2px" }}>{svc.name}</h3>
                    </div>
                    <span
                      className={`badge ${svc.status === "online" ? "badge-success" : svc.status === "offline" ? "badge-warning" : "badge-info"
                        }`}
                    >
                      {svc.status === "online" ? "Saudável" : svc.status === "offline" ? "Pendente" : "Inicializando"}
                    </span>
                  </div>

                  <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "18px", minHeight: "42px" }}>
                    {svc.description}
                  </p>

                  <div
                    style={{
                      background: "rgba(0, 0, 0, 0.3)",
                      padding: "10px 14px",
                      borderRadius: "var(--radius-sm)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.82rem",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>Endpoint:</span>
                    <span style={{ color: "var(--accent-primary)" }}>{svc.endpoint}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Architecture Principles Callout */}
            <div
              className="glass-panel"
              style={{
                padding: "24px",
                borderLeft: "4px solid var(--accent-primary)",
                background: "linear-gradient(90deg, rgba(99, 102, 241, 0.08) 0%, transparent 100%)",
              }}
            >
              <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                <AlertCircle size={18} color="var(--accent-primary)" />
                Fronteira Arquitetural Crítica (RNF-01 e PRD 10.2)
              </h4>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <strong>O serviço de IA nunca escreve direto na base de negócio.</strong> O Python / Ollama gera sugestões
                estruturadas e métricas de aderência, mas a persistência só ocorre via <strong>Node.js</strong> após validação e
                confirmação explícita do Product Owner. O n8n gerencia os gatilhos e orquestra a chegada de arquivos em <code>/files</code>.
              </p>
            </div>
          </div>
        )}

        {activeTab === "requirements" && (
          <div className="glass-panel" style={{ padding: "32px" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "12px" }}>
              Modelo de Requisitos & Proveniência
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "24px" }}>
              Estrutura padrão de requisitos em 4 níveis (Projeto &rarr; Épico &rarr; Feature &rarr; PBI) com rastreabilidade de autoria humana vs IA.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "20px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <h4 style={{ fontWeight: 600, marginBottom: "12px", color: "var(--accent-secondary)" }}>Regras de Proveniência (PRD 12)</h4>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="badge badge-info">HUMAN-AUTHORED</span> Requisito digitado e estruturado integralmente pelo PO.
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="badge badge-success">AI-ACCEPTED</span> Sugestão da IA aceita sem alterações pelo PO.
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="badge badge-warning">AI-EDITED</span> Sugestão da IA ajustada ou refinada pelo PO.
                  </li>
                </ul>
              </div>

              <div style={{ background: "rgba(0, 0, 0, 0.25)", padding: "20px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
                <h4 style={{ fontWeight: 600, marginBottom: "12px", color: "var(--accent-primary)" }}>Validação Determinística</h4>
                <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  O Backend em Node.js valida os checklists mínimos (RF-08 a RF-11):
                  título claro, ator definido, critérios de aceitação no padrão Gherkin/BDD, e regras de negócio sem ambiguidades.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "rag" && (
          <div className="glass-panel" style={{ padding: "32px" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "12px" }}>
              Pipeline de RAG & Harness do Modelo
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem", marginBottom: "24px" }}>
              O microsserviço Python implementa o harness responsável por guiar o modelo local (Ollama) para <em>perguntar antes de redigir</em> e citar fontes.
            </p>

            <div style={{ background: "rgba(0,0,0,0.3)", padding: "20px", borderRadius: "var(--radius-sm)", fontFamily: "var(--font-mono)", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              <div style={{ color: "#34d399", marginBottom: "8px" }}>// Estratégia de Chunking Unificada (PRD 10.3)</div>
              <div>&bull; Conteúdo estruturado: Cada requisito ou decisão é 1 chunk atômico.</div>
              <div>&bull; Documentos de upload: 800-1200 caracteres com overlap de 150 caracteres.</div>
              <div>&bull; Busca Híbrida: Vetorial (bge-m3 no pgvector) + Full-Text Search (tsvector PT-BR).</div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "16px 32px",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        PRO4TECH &middot; Fatec São José dos Campos &middot; Grupo Galáticos &middot; 2º Semestre/2026
      </footer>
    </div>
  );
};
