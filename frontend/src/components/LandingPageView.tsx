import React from "react";
import { Sparkles, BookOpen, ShieldCheck, Search, ArrowRight } from "lucide-react";
import { navigate } from "../auth/navigation";

export const LandingPageView: React.FC = () => {
    return (
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 0", display: "flex", flexDirection: "column", gap: "48px" }}>

            {/* Hero Section */}
            <div className="glass-panel" style={{ padding: "48px 36px", textAlign: "center", background: "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)", border: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(99, 102, 241, 0.15)", padding: "6px 16px", borderRadius: "20px", color: "var(--accent-primary)", fontSize: "0.85rem", fontWeight: 600, marginBottom: "20px" }}>
                    <Sparkles size={16} /> A Memória Inteligente da Fábrica de Software
                </div>
                <h1 style={{ fontSize: "2.5rem", fontWeight: 800, color: "#fff", marginBottom: "16px", lineHeight: 1.2 }}>
                    Transforme requisitos em uma base de conhecimento reutilizável
                </h1>
                <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", maxWidth: "800px", margin: "0 auto 32px auto", lineHeight: 1.6 }}>
                    O <strong>Sinapse</strong> conecta projetos, pessoas e tecnologias. Ajuda Product Owners a especificarem funcionalidades com menos retrabalho, evitando a perda de conhecimento tácito.
                </p>
                <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
                    <button className="btn-primary" onClick={() => navigate("/projects")} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", fontSize: "1rem" }}>
                        Explorar Projetos <ArrowRight size={18} />
                    </button>
                    <button className="btn-secondary" onClick={() => navigate("/knowledge")} style={{ padding: "12px 24px", fontSize: "1rem" }}>
                        Consultar Acervo
                    </button>
                </div>
            </div>

            {/* Core Value Pillars */}
            <div>
                <div style={{ textAlign: "center", marginBottom: "32px" }}>
                    <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>Pilares do Ecossistema</h2>
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>Tudo o que sua equipe precisa para padronizar entregas com inteligência contextual.</p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
                    <div className="glass-panel" style={{ padding: "28px" }}>
                        <div style={{ color: "var(--accent-primary)", marginBottom: "16px" }}><BookOpen size={28} /></div>
                        <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>Hierarquia Estruturada</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                            Organize entregas de ponta a ponta: <strong>Projeto &rarr; Épico &rarr; Feature &rarr; PBI</strong> com critérios de aceitação em BDD.
                        </p>
                    </div>

                    <div className="glass-panel" style={{ padding: "28px" }}>
                        <div style={{ color: "var(--accent-secondary)", marginBottom: "16px" }}><ShieldCheck size={28} /></div>
                        <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>IA Assistiva com Governança</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                            A IA atua como um copiloto para questionar lacunas, mas <strong>nunca grava dados automaticamente sem a aprovação</strong> do Product Owner.
                        </p>
                    </div>

                    <div className="glass-panel" style={{ padding: "28px" }}>
                        <div style={{ color: "#34d399", marginBottom: "16px" }}><Search size={28} /></div>
                        <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>Busca Híbrida & Memória</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                            Encontre rapidamente decisões passadas e consulte o acervo documental por projeto para reaproveitar aprendizados anteriores.
                        </p>
                    </div>
                </div>
            </div>

        </div>
    );
};