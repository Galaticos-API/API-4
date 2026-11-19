import { useEffect, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  createAllocation,
  removeAllocation,
  updateAllocation,
  type DeveloperAllocation,
} from "../../api/api_developers";
import { listProjects, type Project } from "../../api/api_projects";
import { allocationDay, formatAllocationDay } from "../../models/allocations";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const details = error.details as { error?: string } | undefined;
    if (details?.error) return details.error;
  }
  return error instanceof Error && !/^HTTP \d+$/.test(error.message) ? error.message : fallback;
}

type Period = { papel: string; data_inicio: string; data_fim: string };
const emptyPeriod: Period = { papel: "", data_inicio: "", data_fim: "" };

/** Mesma regra do backend, para indicar a inconsistência antes de enviar (PBI-05.1.3, cenário 3). */
export function periodError(period: Pick<Period, "data_inicio" | "data_fim">): string {
  if (period.data_inicio && period.data_fim && period.data_fim < period.data_inicio) {
    return "A data de término não pode ser anterior à data de início.";
  }
  return "";
}

async function loadAllProjects(signal: AbortSignal): Promise<Project[]> {
  const projects: Project[] = [];
  for (let offset = 0, page = 0; page < 20; page += 1) {
    const result = await listProjects(signal, offset);
    projects.push(...result.projects);
    offset += result.projects.length;
    if (result.projects.length === 0 || offset >= result.total) break;
  }
  return projects.filter((project) => project.status !== "arquivado");
}

function PeriodFields({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  return (
    <>
      <label>
        Papel
        <input value={value.papel} maxLength={100} placeholder="Ex.: Desenvolvedor backend" onChange={(event) => onChange({ ...value, papel: event.target.value })} />
      </label>
      <label>
        Início
        <input type="date" value={value.data_inicio} onChange={(event) => onChange({ ...value, data_inicio: event.target.value })} />
      </label>
      <label>
        Término (deixe vazio se em andamento)
        <input type="date" value={value.data_fim} min={value.data_inicio || undefined} onChange={(event) => onChange({ ...value, data_fim: event.target.value })} />
      </label>
    </>
  );
}

export function AllocationsPanel({
  developerId,
  alocacoes,
  canManage,
  onChanged,
}: {
  developerId: string;
  alocacoes: DeveloperAllocation[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState("");
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<Period>(emptyPeriod);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Period>(emptyPeriod);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    loadAllProjects(controller.signal)
      .then((items) => { if (!controller.signal.aborted) setProjects(items); })
      .catch(() => { if (!controller.signal.aborted) setProjectsError("Não foi possível carregar os projetos."); });
    return () => controller.abort();
  }, [canManage]);

  async function run(work: () => Promise<void>, success: string, fallback: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(success);
      onChanged();
    } catch (err) {
      setError(apiMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const createPeriodError = periodError(draft);
  const editPeriodError = periodError(editDraft);

  return (
    <article className="ds-card" style={{ padding: "24px" }} aria-label="Alocações em projetos">
      <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Alocações em Projetos ({alocacoes.length})</h3>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {alocacoes.length === 0 ? (
        <p className="muted">Nenhuma alocação registrada em projetos visíveis.</p>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {alocacoes.map((aloc) => (
            <div key={aloc.id} className="ds-card" style={{ padding: "16px", display: "grid", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <strong>{aloc.projeto_nome}</strong>
                    <span className={`ds-badge ${aloc.em_andamento ? "ds-badge--success" : ""}`}>
                      {aloc.em_andamento ? "Em andamento" : "Encerrada"}
                    </span>
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.88rem" }}>
                    Papel: <strong>{aloc.papel || "Integrante"}</strong> · Período: {formatAllocationDay(aloc.data_inicio)} até{" "}
                    {aloc.data_fim ? formatAllocationDay(aloc.data_fim) : "Em andamento"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <Button variant="secondary" onClick={() => navigate(`/projects/${aloc.projeto_id}`)}>Abrir projeto</Button>
                  {canManage && editing !== aloc.id && (
                    <>
                      <Button
                        variant="secondary"
                        aria-label={`Editar alocação em ${aloc.projeto_nome}`}
                        onClick={() => {
                          setEditing(aloc.id);
                          setEditDraft({ papel: aloc.papel ?? "", data_inicio: allocationDay(aloc.data_inicio), data_fim: allocationDay(aloc.data_fim) });
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        aria-label={`Remover alocação em ${aloc.projeto_nome}`}
                        onClick={() => {
                          if (!window.confirm(`Remover a alocação em ${aloc.projeto_nome}? O acesso do profissional a este projeto também deixa de valer.`)) return;
                          void run(() => removeAllocation(developerId, aloc.id), "Alocação removida.", "Não foi possível remover a alocação.");
                        }}
                      >
                        Remover
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {editing === aloc.id && (
                <form
                  aria-label={`Editar alocação em ${aloc.projeto_nome}`}
                  style={{ display: "grid", gap: "8px" }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editPeriodError) return;
                    void run(async () => {
                      await updateAllocation(developerId, aloc.id, {
                        papel: editDraft.papel.trim(),
                        data_inicio: editDraft.data_inicio,
                        data_fim: editDraft.data_fim || null,
                      });
                      setEditing(null);
                    }, "Alocação atualizada.", "Não foi possível atualizar a alocação.");
                  }}
                >
                  <PeriodFields value={editDraft} onChange={setEditDraft} />
                  {editPeriodError && <p role="alert">{editPeriodError}</p>}
                  <div>
                    <Button type="submit" disabled={busy || Boolean(editPeriodError) || !editDraft.papel.trim() || !editDraft.data_inicio}>Salvar</Button>{" "}
                    <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <form
          aria-label="Registrar alocação"
          style={{ marginTop: "16px", display: "grid", gap: "8px" }}
          onSubmit={(event) => {
            event.preventDefault();
            if (createPeriodError) return;
            void run(async () => {
              await createAllocation(developerId, {
                projeto_id: projectId,
                papel: draft.papel.trim(),
                data_inicio: draft.data_inicio,
                data_fim: draft.data_fim || null,
              });
              setProjectId("");
              setDraft(emptyPeriod);
            }, "Alocação registrada. O histórico consolidado já reflete a inclusão.", "Não foi possível registrar a alocação.");
          }}
        >
          <h4 style={{ margin: 0 }}>Registrar alocação</h4>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Enquanto vigente, a alocação concede ao usuário vinculado acesso de leitura ao projeto.
          </p>
          {projectsError && <p role="alert">{projectsError}</p>}
          <label>
            Projeto
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={!projects}>
              <option value="">{projects ? "Selecione um projeto" : "Carregando projetos…"}</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.nome}</option>)}
            </select>
          </label>
          <PeriodFields value={draft} onChange={setDraft} />
          {createPeriodError && <p role="alert">{createPeriodError}</p>}
          <div>
            <Button type="submit" disabled={busy || Boolean(createPeriodError) || !projectId || !draft.papel.trim() || !draft.data_inicio}>
              Registrar alocação
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
