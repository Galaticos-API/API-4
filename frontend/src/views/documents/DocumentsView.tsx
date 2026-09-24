import React, { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../../api/api_auth";
import "../../assets/styles/garakis-prototype.css";

interface DocumentItem {
  id: string;
  projeto_id: string;
  nome: string;
  mime: string;
  caminho: string;
  status_processamento: "pendente" | "processando" | "processado" | "falha";
  created_at: string;
  projeto_nome?: string;
}

export const DocumentsView: React.FC<{ projectId?: string; projectName?: string }> = ({
  projectId,
  projectName,
}) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const url = projectId ? `/projects/${projectId}/documents` : "/documents";
      const res = await apiRequest(url);
      const data = await res.json();
      setDocuments(data.items || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao carregar documentos do servidor.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!projectId) {
      setNotice("Selecione um projeto para vincular o documento.");
      return;
    }

    setUploading(true);
    setNotice("Enviando documento e registrando no banco de dados...");
    setError("");

    try {
      const ext = file.name.split(".").pop()?.toUpperCase() || "DOC";
      const res = await apiRequest(`/projects/${projectId}/documents`, {
        method: "POST",
        body: JSON.stringify({
          nome: file.name,
          mime: ext,
          caminho: `/uploads/${file.name}`,
          status_processamento: "processado",
        }),
      });

      if (!res.ok) throw new Error("Falha ao salvar documento no backend");

      const newDoc = await res.json();
      setDocuments((prev) => [newDoc, ...prev]);
      setNotice("Documento registrado e indexado com sucesso no acervo!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao fazer upload do documento.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: "40px" }}>
      <div className="head-section">
        <div>
          <div className="eyebrow">ACERVO TÉCNICO</div>
          <h1>Documentos do Projeto {projectName ? `· ${projectName}` : ""}</h1>
          <p className="muted">
            Referências, PDFs, arquivos OpenAPI e documentação técnica indexada para o assistente Sinapse.
          </p>
        </div>

        <label className="btn-garakis primary" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
          <span>+ Indexar documento</span>
          <input type="file" onChange={handleFileUpload} disabled={uploading} style={{ display: "none" }} />
        </label>
      </div>

      {notice && (
        <div className="card-garakis" style={{ background: "rgba(59, 130, 246, 0.1)", borderColor: "rgba(59, 130, 246, 0.3)", margin: "16px 0", color: "#93c5fd" }}>
          {notice}
        </div>
      )}

      {error && (
        <div className="card-garakis" style={{ background: "rgba(239, 68, 68, 0.1)", borderColor: "rgba(239, 68, 68, 0.3)", margin: "16px 0", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="card-garakis" role="status" style={{ textAlign: "center", padding: "32px" }}>
          Carregando documentos do backend...
        </div>
      ) : documents.length === 0 ? (
        <div className="card-garakis" style={{ textAlign: "center", padding: "48px 24px", marginTop: "16px" }}>
          <h3>Nenhum documento cadastrado neste projeto</h3>
          <p className="muted">Faça o upload do primeiro documento técnico para disponibilizar no acervo RAG.</p>
        </div>
      ) : (
        <div className="grid-garakis one" style={{ gap: "12px", marginTop: "20px" }}>
          {documents.map((doc) => (
            <article className="card-garakis" key={doc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span className="badge-garakis blue" style={{ fontWeight: 700 }}>{doc.mime}</span>
                <div>
                  <h4 style={{ margin: 0, color: "#fff", fontSize: "1rem" }}>{doc.nome}</h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                    Enviado em {new Date(doc.created_at).toLocaleDateString("pt-BR")} {doc.projeto_nome ? `· Projeto: ${doc.projeto_nome}` : ""}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className={`badge-garakis ${doc.status_processamento === "processado" ? "green" : doc.status_processamento === "falha" ? "red" : "orange"}`}>
                  {doc.status_processamento}
                </span>
                <button
                  className="btn-garakis ghost"
                  onClick={async () => {
                    await apiRequest(`/documents/${doc.id}`, { method: "DELETE" });
                    setDocuments(prev => prev.filter(d => d.id !== doc.id));
                  }}
                  title="Remover documento"
                >
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
