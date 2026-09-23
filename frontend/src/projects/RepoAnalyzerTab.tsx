import React, { useState, useEffect } from 'react';
import { startRepoAnalysis, listRepoAnalyses, RepoAnalysis } from './repo-analyzer.api';

interface RepoAnalyzerTabProps {
    projectId: string;
}

export const RepoAnalyzerTab: React.FC<RepoAnalyzerTabProps> = ({ projectId }) => {
    const [repoUrl, setRepoUrl] = useState<string>('');
    const [analyses, setAnalyses] = useState<RepoAnalysis[]>([]);
    const [selectedAnalysis, setSelectedAnalysis] = useState<RepoAnalysis | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fetchAnalyses = async () => {
        try {
            const data = await listRepoAnalyses(projectId);
            setAnalyses(data);
            if (data.length > 0 && !selectedAnalysis) {
                setSelectedAnalysis(data[0]);
            }
        } catch (err: any) {
            console.error('Erro ao buscar análises:', err);
        }
    };

    useEffect(() => {
        fetchAnalyses();
        const interval = setInterval(() => {
            if (selectedAnalysis && (selectedAnalysis.status === 'iniciado' || selectedAnalysis.status === 'em_execucao')) {
                fetchAnalyses();
            }
        }, 4000);
        return () => clearInterval(interval);
    }, [projectId, selectedAnalysis?.status]);

    const handleStart = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) return;
        setLoading(true);
        setError('');
        try {
            const newAnalysis = await startRepoAnalysis(projectId, repoUrl);
            setRepoUrl('');
            await fetchAnalyses();
            setSelectedAnalysis(newAnalysis);
        } catch (err: any) {
            setError(err instanceof Error ? err.message : 'Erro ao iniciar análise');
        } finally {
            setLoading(false);
        }
    };

    const downloadMarkdown = (content: string, repoName: string) => {
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio-${repoName.replace(/[^a-zA-Z0-9]/g, '-')}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div className="glass-panel" style={{ padding: "24px" }}>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>Análise de repositório GitHub</h3>
                <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Informe a URL de um repositório público do GitHub para executar a varredura inteligente e gerar o relatório técnico de arquitetura
                </p>
                <form onSubmit={handleStart} style={{ display: "flex", gap: "12px" }}>
                    <input
                        type="url"
                        placeholder="https://github.com/usuario/repositorio"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        required
                        style={{
                            flex: 1,
                            padding: "10px 16px",
                            borderRadius: "var(--radius-sm)",
                            border: "1px solid var(--border-subtle)",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            outline: "none",
                        }}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary"
                    >
                        {loading ? 'Iniciando...' : 'Iniciar Análise'}
                    </button>
                </form>
                {error && <p style={{ color: "#fca5a5", fontSize: "0.85rem", marginTop: "8px" }}>{error}</p>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
                {/* Histórico */}
                <div className="glass-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <h4 style={{ fontWeight: 600, color: "var(--text-primary)", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>Histórico de Análises</h4>
                    {analyses.length === 0 ? (
                        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>Nenhuma análise realizada neste projeto.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "500px", overflowY: "auto" }}>
                            {analyses.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedAnalysis(item)}
                                    style={{
                                        padding: "12px",
                                        borderRadius: "var(--radius-sm)",
                                        cursor: "pointer",
                                        border: `1px solid ${selectedAnalysis?.id === item.id ? "var(--border-active)" : "var(--border-subtle)"}`,
                                        background: selectedAnalysis?.id === item.id ? "var(--bg-card-hover)" : "rgba(0,0,0,0.2)",
                                        transition: "var(--transition-fast)"
                                    }}
                                >
                                    <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{item.repositorio_url}</p>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
                                        <span className={`badge ${item.status === 'concluido' ? 'badge-success' : item.status === 'falha' ? 'badge-warning' : 'badge-info'}`}>
                                            {item.status}
                                        </span>
                                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detalhes */}
                <div className="glass-panel" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", gridColumn: "1 / -1" }}>
                    {selectedAnalysis ? (
                        <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "12px", flexWrap: "wrap", gap: "12px" }}>
                                <div>
                                    <h4 style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "1rem" }}>{selectedAnalysis.repositorio_url}</h4>
                                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                                        Autor: <span style={{ fontWeight: 500 }}>{selectedAnalysis.autor_nome || 'PO'}</span> ({selectedAnalysis.autor_email || 'po@sinapse.local'})
                                    </p>
                                </div>
                                {selectedAnalysis.status === 'concluido' && selectedAnalysis.relatorio_markdown && (
                                    <button
                                        onClick={() => downloadMarkdown(selectedAnalysis.relatorio_markdown!, selectedAnalysis.repositorio_url)}
                                        className="btn-secondary"
                                        style={{ fontSize: "0.75rem", padding: "6px 12px" }}
                                    >
                                        Baixar Relatório (.md)
                                    </button>
                                )}
                            </div>

                            {/* Barra de Progresso */}
                            {(selectedAnalysis.status === 'iniciado' || selectedAnalysis.status === 'em_execucao') && (
                                <div style={{ background: "rgba(0,0,0,0.25)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-primary)" }}>
                                        <span>Etapa: {selectedAnalysis.etapa_label || selectedAnalysis.etapa}</span>
                                        <span>{selectedAnalysis.progresso}%</span>
                                    </div>
                                    <div style={{ width: "100%", background: "var(--bg-tertiary)", borderRadius: "var(--radius-full)", height: "10px" }}>
                                        <div style={{ background: "linear-gradient(90deg, var(--accent-secondary) 0%, var(--accent-primary) 100%)", height: "10px", borderRadius: "var(--radius-full)", transition: "width 0.5s ease", width: `${selectedAnalysis.progresso}%` }}></div>
                                    </div>
                                    {selectedAnalysis.mensagem && <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontStyle: "italic" }}>{selectedAnalysis.mensagem}</p>}
                                </div>
                            )}

                            {selectedAnalysis.status === 'falha' && (
                                <div style={{ background: "rgba(245, 158, 11, 0.1)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid rgba(245, 158, 11, 0.3)", color: "#fbbf24", fontSize: "0.85rem" }}>
                                    <p style={{ fontWeight: 600 }}>Falha na execução:</p>
                                    <p>{selectedAnalysis.erro || 'Erro desconhecido durante o pipeline.'}</p>
                                </div>
                            )}

                            {/* Renderizador do Relatório Markdown */}
                            {selectedAnalysis.status === 'concluido' && selectedAnalysis.relatorio_markdown && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                    <h5 style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.85rem" }}>Relatório Técnico Gerado:</h5>
                                    <div style={{ background: "var(--bg-tertiary)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", maxHeight: "400px", overflowY: "auto", fontSize: "0.85rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)" }}>
                                        {selectedAnalysis.relatorio_markdown}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
                            <p>Selecione uma análise ao lado ou inicie uma nova para acompanhar os detalhes.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
