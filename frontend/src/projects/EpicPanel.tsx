import { useEffect, useState } from "react";
import { completeEpic, createEpic, listEpicos, missingEpicFields, type Epic, type EpicFormInput } from "./epicos";

const emptyForm = (): EpicFormInput => ({
  titulo: "",
  descricao: "",
  objetivo: "",
  escopo_macro: "",
  resultado_esperado: "",
  prioridade: "Must",
});

export function EpicPanel({ projectId, canCreate = true }: { projectId: string; canCreate?: boolean }) {
  const [epicos, setEpicos] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<EpicFormInput>(emptyForm());
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listEpicos(projectId);
      setEpicos(result);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os épicos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [projectId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.titulo.trim()) {
      setError("O título do épico é obrigatório.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const newEpic = await createEpic(projectId, form);
      setEpicos((previous) => [newEpic, ...previous]);
      setForm(emptyForm());
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o épico.");
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async (epicId: string) => {
    setBusy(true);
    setError("");
    try {
      const updated = await completeEpic(epicId);
      setEpicos((previous) => previous.map((epico) => (epico.id === epicId ? updated : epico)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir o épico.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="glass-panel" style={{ padding: "24px", marginTop: "24px" }} aria-label="Seção de Épicos">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0 }}>Épicos do Projeto</h3>
          <p style={{ margin: "4px 0 0 0", color: "var(--color-text-secondary, #94a3b8)", fontSize: "0.9rem" }}>
            Hierarquia do Guia PRO4TECH: Projeto → Épico → Feature → PBI
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowForm((prev) => !prev)}
            aria-expanded={showForm}
          >
            {showForm ? "Cancelar" : "+ Novo Épico"}
          </button>
        )}
      </div>

      {canCreate && showForm && (
        <form
          onSubmit={handleSubmit}
          className="glass-panel"
          style={{ padding: "20px", marginBottom: "24px", display: "grid", gap: "14px" }}
        >
          <h4 style={{ margin: "0 0 8px 0" }}>Cadastrar Novo Épico (Salvo como Rascunho)</h4>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-secondary, #cbd5e1)" }}>
            Campos obrigatórios do guia para conclusão: <strong>Título</strong>, <strong>Descrição</strong>,{" "}
            <strong>Objetivo</strong>, <strong>Escopo Macro</strong> e <strong>Resultado Esperado</strong>.
            Você pode salvar incompleto como <em>rascunho</em> a qualquer momento.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "12px" }}>
            <label style={{ display: "grid", gap: "6px" }}>
              <span>Título da Iniciativa *</span>
              <input
                type="text"
                placeholder="Ex: Digitalizar o acompanhamento de solicitações"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                required
              />
            </label>
            <label style={{ display: "grid", gap: "6px" }}>
              <span>Prioridade</span>
              <select
                value={form.prioridade}
                onChange={(e) => setForm({ ...form, prioridade: e.target.value as "Must" | "Should" | "Could" })}
                style={{ height: "42px", padding: "0 12px" }}
              >
                <option value="Must">Must</option>
                <option value="Should">Should</option>
                <option value="Could">Could</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Descrição (Contexto de uso e público afetado)</span>
            <textarea
              placeholder="O que será construído ou alterado, para quem e em qual contexto..."
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              rows={2}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Objetivo (Propósito e valor esperado)</span>
            <textarea
              placeholder="Explica o propósito e o valor esperado. Por que o Épico é necessário..."
              value={form.objetivo}
              onChange={(e) => setForm({ ...form, objetivo: e.target.value })}
              rows={2}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Escopo Macro (Grandes blocos de capacidades incluídos)</span>
            <textarea
              placeholder="Ex: consulta de solicitações; visualização de status; histórico de atualizações; notificações..."
              value={form.escopo_macro}
              onChange={(e) => setForm({ ...form, escopo_macro: e.target.value })}
              rows={2}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span>Resultado Esperado (Estado desejado após a conclusão)</span>
            <textarea
              placeholder="Ex: o cliente consegue acompanhar a evolução de suas solicitações de forma autônoma..."
              value={form.resultado_esperado}
              onChange={(e) => setForm({ ...form, resultado_esperado: e.target.value })}
              rows={2}
            />
          </label>

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Fechar
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar Épico (Rascunho)"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div role="alert" className="glass-panel" style={{ padding: "12px", marginBottom: "16px", borderColor: "#f87171", color: "#fca5a5" }}>
          {error}
        </div>
      )}

      {loading ? (
        <p role="status">Carregando épicos do projeto…</p>
      ) : epicos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--color-text-secondary, #94a3b8)" }}>
          <p>Nenhum épico cadastrado para este projeto ainda.</p>
          {canCreate && (
            <button type="button" className="btn-secondary" onClick={() => setShowForm(true)}>
              Cadastrar primeiro épico
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {epicos.map((epico) => {
            const missing = epico.missing_fields ?? missingEpicFields(epico);
            const isRascunho = epico.status === "rascunho";
            const isConcluido = epico.status === "concluido";

            return (
              <article
                key={epico.id}
                className="glass-panel"
                style={{ padding: "18px", borderLeft: isConcluido ? "4px solid #34d399" : isRascunho ? "4px solid #fbbf24" : "4px solid var(--color-primary, #6366f1)" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                  <div>
                    <h4 style={{ margin: "0 0 6px 0", fontSize: "1.1rem" }}>{epico.titulo}</h4>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span className={`badge ${isConcluido ? "badge-success" : isRascunho ? "badge-warning" : "badge-info"}`}>
                        {epico.status}
                      </span>
                      <span className="badge" style={{ opacity: 0.85 }}>{epico.prioridade}</span>
                    </div>
                  </div>

                  {canCreate && !isConcluido && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void handleComplete(epico.id)}
                      disabled={missing.length > 0 || busy}
                      title={missing.length > 0 ? `Faltam: ${missing.join(", ")}` : "Marcar épico como concluído"}
                    >
                      Concluir épico
                    </button>
                  )}
                </div>

                {epico.descricao && (
                  <p style={{ margin: "12px 0 8px 0", color: "#e2e8f0" }}>
                    {epico.descricao}
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginTop: "12px", fontSize: "0.88rem", opacity: 0.9 }}>
                  {epico.objetivo && (
                    <div>
                      <strong>Objetivo:</strong> {epico.objetivo}
                    </div>
                  )}
                  {epico.escopo_macro && (
                    <div>
                      <strong>Escopo Macro:</strong> {epico.escopo_macro}
                    </div>
                  )}
                  {epico.resultado_esperado && (
                    <div>
                      <strong>Resultado Esperado:</strong> {epico.resultado_esperado}
                    </div>
                  )}
                </div>

                {isRascunho && missing.length > 0 && (
                  <div
                    style={{
                      marginTop: "14px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      background: "rgba(251, 191, 36, 0.1)",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                      color: "#fbbf24",
                      fontSize: "0.85rem",
                    }}
                  >
                    ⚠️ <strong>Campos obrigatórios do guia pendentes para conclusão:</strong> {missing.join(", ")}.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
