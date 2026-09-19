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
            setError(err.response?.data?.error || 'Erro ao iniciar análise');
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
        <div className="p-6 space-y-6">
            <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">🔬 Análise de Repositório GitHub</h3>
                <p className="text-sm text-gray-600 mb-4">
                    Informe a URL de um repositório público do GitHub para executar a varredura inteligente e gerar o relatório técnico de arquitetura.
                </p>
                <form onSubmit={handleStart} className="flex gap-3">
                    <input
                        type="url"
                        placeholder="https://github.com/usuario/repositorio"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        required
                        className="flex-1 px-4 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-5 py-2 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                        {loading ? 'Iniciando...' : 'Iniciar Análise'}
                    </button>
                </form>
                {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Histórico / Lista de Análises */}
                <div className="bg-white p-4 rounded-lg shadow border border-gray-200 space-y-3">
                    <h4 className="font-semibold text-gray-700 border-b pb-2">Histórico de Análises</h4>
                    {analyses.length === 0 ? (
                        <p className="text-sm text-gray-500">Nenhuma análise realizada neste projeto.</p>
                    ) : (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {analyses.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => setSelectedAnalysis(item)}
                                    className={`p-3 rounded-md cursor-pointer transition border ${selectedAnalysis?.id === item.id ? 'bg-indigo-50 border-indigo-300' : 'bg-gray-50 hover:bg-gray-100 border-gray-200'
                                        }`}
                                >
                                    <p className="text-xs font-semibold text-gray-600 truncate">{item.repositorio_url}</p>
                                    <div className="flex justify-between items-center mt-2 text-xs">
                                        <span className={`px-2 py-0.5 rounded-full font-medium ${item.status === 'concluido' ? 'bg-green-100 text-green-700' :
                                            item.status === 'falha' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                            {item.status}
                                        </span>
                                        <span className="text-gray-400">{new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detalhes e Visualizador de Progresso / Relatório */}
                <div className="md:col-span-2 bg-white p-6 rounded-lg shadow border border-gray-200 space-y-4">
                    {selectedAnalysis ? (
                        <>
                            <div className="flex justify-between items-start border-b pb-3">
                                <div>
                                    <h4 className="font-bold text-gray-800 text-base">{selectedAnalysis.repositorio_url}</h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Autor: <span className="font-medium">{selectedAnalysis.autor_nome || 'PO'}</span> ({selectedAnalysis.autor_email || 'po@sinapse.local'})
                                    </p>
                                </div>
                                {selectedAnalysis.status === 'concluido' && selectedAnalysis.relatorio_markdown && (
                                    <button
                                        onClick={() => downloadMarkdown(selectedAnalysis.relatorio_markdown!, selectedAnalysis.repositorio_url)}
                                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition"
                                    >
                                        Baixar Relatório (.md)
                                    </button>
                                )}
                            </div>

                            {/* Barra de Progresso */}
                            {(selectedAnalysis.status === 'iniciado' || selectedAnalysis.status === 'em_execucao') && (
                                <div className="space-y-2 bg-gray-50 p-4 rounded-md border">
                                    <div className="flex justify-between text-xs font-medium text-gray-700">
                                        <span>Etapa: {selectedAnalysis.etapa_label || selectedAnalysis.etapa}</span>
                                        <span>{selectedAnalysis.progresso}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                                        <div className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${selectedAnalysis.progresso}%` }}></div>
                                    </div>
                                    {selectedAnalysis.mensagem && <p className="text-xs text-gray-500 italic">{selectedAnalysis.mensagem}</p>}
                                </div>
                            )}

                            {selectedAnalysis.status === 'falha' && (
                                <div className="bg-red-50 p-4 rounded-md border border-red-200 text-red-700 text-sm">
                                    <p className="font-semibold">Falha na execução:</p>
                                    <p>{selectedAnalysis.erro || 'Erro desconhecido durante o pipeline.'}</p>
                                </div>
                            )}

                            {/* Renderizador do Relatório Markdown */}
                            {selectedAnalysis.status === 'concluido' && selectedAnalysis.relatorio_markdown && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-gray-700 text-sm">Relatório Técnico Gerado:</h5>
                                    <div className="bg-gray-50 p-4 rounded-md border max-h-[400px] overflow-y-auto text-sm text-gray-800 whitespace-pre-wrap font-mono">
                                        {selectedAnalysis.relatorio_markdown}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-center py-20 text-gray-400">
                            <p>Selecione uma análise ao lado ou inicie uma nova para acompanhar os detalhes.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};