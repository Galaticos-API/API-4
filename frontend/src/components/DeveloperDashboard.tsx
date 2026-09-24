import React, { useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

interface ServiceStatus {
    name: string;
    category: string;
    port: number;
    status: "online" | "offline" | "checking";
    endpoint: string;
    description: string;
}

export const DeveloperDashboard: React.FC = () => {
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
        fetch("http://localhost:3001/health")
            .then((res) => (res.ok ? setBackendHealth("online") : setBackendHealth("offline")))
            .catch(() => setBackendHealth("offline"));

        fetch("http://localhost:11434/api/tags")
            .then((res) => (res.ok ? setOllamaHealth("online") : setOllamaHealth("offline")))
            .catch(() => setOllamaHealth("offline"));
    }, []);

    return (
        <div>
            <div style={{ marginBottom: "28px" }}>
                <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "8px" }}>
                    Topologia de Serviços e Microsserviços (Devs)
                </h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
                    Visão unificada das 6 camadas da solução configuradas de acordo com a seção 10 do PRD.
                </p>
            </div>

            <div className="architecture-grid" style={{ display: "grid", gap: "20px", marginBottom: "36px" }}>
                {services.map((svc) => (
                    <div key={svc.name} className="glass-panel" style={{ padding: "24px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                            <div>
                                <span style={{ fontSize: "0.75rem", color: "var(--accent-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                                    {svc.category}
                                </span>
                                <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginTop: "2px" }}>{svc.name}</h3>
                            </div>
                            <span className={`badge ${svc.status === "online" ? "badge-success" : svc.status === "offline" ? "badge-warning" : "badge-info"}`}>
                                {svc.status === "online" ? "Saudável" : svc.status === "offline" ? "Pendente" : "Inicializando"}
                            </span>
                        </div>

                        <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginBottom: "18px", minHeight: "42px" }}>
                            {svc.description}
                        </p>

                        <div style={{ background: "rgba(0, 0, 0, 0.3)", padding: "10px 14px", borderRadius: "var(--radius-sm)", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", fontFamily: "var(--font-mono)" }}>
                            <span style={{ color: "var(--text-muted)" }}>Endpoint:</span>
                            <span style={{ color: "var(--accent-primary)" }}>{svc.endpoint}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="glass-panel" style={{ padding: "24px", borderLeft: "4px solid var(--accent-primary)", background: "linear-gradient(90deg, rgba(249, 115, 22, 0.08) 0%, transparent 100%)" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <AlertCircle size={18} color="var(--accent-primary)" />
                    Fronteira Arquitetural Crítica (RNF-01 e PRD 10.2)
                </h4>
                <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <strong>O serviço de IA nunca escreve direto na base de negócio.</strong> O Python / Ollama gera sugestões estruturadas e métricas de aderência, mas a persistência só ocorre via <strong>Node.js</strong> após validação e confirmação explícita do Product Owner. O n8n gerencia os gatilhos e orquestra a chegada de arquivos em <code>/files</code>.
                </p>
            </div>
        </div>
    );
};