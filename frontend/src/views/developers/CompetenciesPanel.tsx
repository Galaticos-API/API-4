import { useEffect, useMemo, useState } from "react";
import { ApiError } from "../../api/api_auth";
import {
  createCompetency,
  removeCompetency,
  updateCompetency,
  type DeveloperCompetency,
} from "../../api/api_developers";
import { COMPETENCY_LEVELS, competencyLevelLabel, type CompetencyLevel } from "../../models/competencies";
import {
  TECHNOLOGY_CATEGORIES,
  TechnologyExistsError,
  createTechnology,
  listVocabulary,
  type Technology,
  type TechnologyCategory,
} from "../../api/api_technologies";
import { normalizeTechnologyName } from "../../models/technologies";
import { Button } from "../common/ui";

function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const details = error.details as { error?: string } | undefined;
    if (details?.error) return details.error;
  }
  return error instanceof Error && !/^HTTP \d+$/.test(error.message) ? error.message : fallback;
}

type Draft = { nivel: CompetencyLevel; evidencia: string };

export function CompetenciesPanel({
  developerId,
  competencias,
  canManage,
  onChanged,
}: {
  developerId: string;
  competencias: DeveloperCompetency[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [vocabulary, setVocabulary] = useState<Technology[] | null>(null);
  const [vocabularyError, setVocabularyError] = useState("");
  const [search, setSearch] = useState("");
  const [technologyId, setTechnologyId] = useState("");
  const [draft, setDraft] = useState<Draft>({ nivel: "intermediario", evidencia: "" });
  const [newCategory, setNewCategory] = useState<TechnologyCategory>("backend");
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ nivel: "intermediario", evidencia: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!canManage) return;
    const controller = new AbortController();
    listVocabulary(controller.signal)
      .then((items) => { if (!controller.signal.aborted) setVocabulary(items); })
      .catch(() => { if (!controller.signal.aborted) setVocabularyError("Não foi possível carregar o vocabulário de tecnologias."); });
    return () => controller.abort();
  }, [canManage]);

  const taken = useMemo(() => new Set(competencias.map((item) => item.tecnologia_id)), [competencias]);
  const term = normalizeTechnologyName(search);
  const options = useMemo(
    () => (vocabulary ?? []).filter((item) => !taken.has(item.id) && (!term || normalizeTechnologyName(item.nome).includes(term))),
    [vocabulary, taken, term],
  );
  const exactMatch = (vocabulary ?? []).find((item) => term && normalizeTechnologyName(item.nome) === term);
  const offerInclusion = Boolean(search.trim() && term && !exactMatch);

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

  async function includeTechnology() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await createTechnology({ nome: search.trim(), categoria: newCategory });
      setVocabulary((current) => [...(current ?? []), created].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setTechnologyId(created.id);
      setSearch(created.nome);
      setMessage(`"${created.nome}" incluída no vocabulário. Complete o nível e a evidência.`);
    } catch (err) {
      if (err instanceof TechnologyExistsError) {
        setTechnologyId(err.existing.id);
        setSearch(err.existing.nome);
        setMessage(`Já existe "${err.existing.nome}" no vocabulário; ela foi selecionada.`);
      } else {
        setError(apiMessage(err, "Não foi possível incluir a tecnologia no vocabulário."));
      }
    } finally {
      setBusy(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!technologyId) {
      setError("Selecione uma tecnologia do vocabulário.");
      return;
    }
    void run(async () => {
      await createCompetency(developerId, { tecnologia_id: technologyId, ...draft, evidencia: draft.evidencia.trim() });
      setTechnologyId("");
      setSearch("");
      setDraft({ nivel: "intermediario", evidencia: "" });
    }, "Competência registrada no perfil.", "Não foi possível registrar a competência.");
  }

  return (
    <article className="ds-card" style={{ padding: "24px" }} aria-label="Competências técnicas">
      <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Competências Técnicas ({competencias.length})</h3>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {competencias.length === 0 ? (
        <p className="muted">Nenhuma competência técnica registrada para este profissional.</p>
      ) : (
        <div className="ds-grid ds-grid--two" style={{ gap: "12px" }}>
          {competencias.map((comp) => (
            <div key={comp.id} className="ds-card" style={{ padding: "16px", background: "rgba(255, 255, 255, 0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                <strong>{comp.tecnologia_nome}</strong>
                <span className="ds-badge ds-badge--brand">{competencyLevelLabel(comp.nivel)}</span>
              </div>
              {editing === comp.id ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      await updateCompetency(developerId, comp.id, { nivel: editDraft.nivel, evidencia: editDraft.evidencia.trim() });
                      setEditing(null);
                    }, "Competência atualizada.", "Não foi possível atualizar a competência.");
                  }}
                >
                  <label>
                    Nível
                    <select value={editDraft.nivel} onChange={(event) => setEditDraft({ ...editDraft, nivel: event.target.value as CompetencyLevel })}>
                      {COMPETENCY_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Evidência
                    <textarea value={editDraft.evidencia} maxLength={2000} onChange={(event) => setEditDraft({ ...editDraft, evidencia: event.target.value })} />
                  </label>
                  <Button type="submit" disabled={busy}>Salvar</Button>{" "}
                  <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
                </form>
              ) : (
                <>
                  <p className="muted" style={{ marginTop: "8px", marginBottom: 0, fontSize: "0.88rem" }}>
                    Evidência: {comp.evidencia || "não informada"}
                  </p>
                  {canManage && (
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-label={`Editar competência em ${comp.tecnologia_nome}`}
                        onClick={() => {
                          setEditing(comp.id);
                          setEditDraft({ nivel: (comp.nivel as CompetencyLevel) ?? "intermediario", evidencia: comp.evidencia ?? "" });
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        aria-label={`Remover competência em ${comp.tecnologia_nome}`}
                        onClick={() => {
                          if (!window.confirm(`Remover a competência em ${comp.tecnologia_nome}?`)) return;
                          void run(() => removeCompetency(developerId, comp.id), "Competência removida.", "Não foi possível remover a competência.");
                        }}
                      >
                        Remover
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <form onSubmit={submit} aria-label="Registrar competência" style={{ marginTop: "16px", display: "grid", gap: "8px" }}>
          <h4 style={{ margin: 0 }}>Registrar competência</h4>
          {vocabularyError && <p role="alert">{vocabularyError}</p>}
          <label>
            Tecnologia (do vocabulário)
            <input
              type="search"
              value={search}
              placeholder="Digite para buscar no vocabulário"
              onChange={(event) => { setSearch(event.target.value); setTechnologyId(""); }}
            />
          </label>
          {vocabulary && search.trim() && !technologyId && options.length > 0 && (
            <ul aria-label="Tecnologias sugeridas" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {options.slice(0, 12).map((item) => (
                <li key={item.id}>
                  <Button type="button" variant="secondary" onClick={() => { setTechnologyId(item.id); setSearch(item.nome); }}>
                    {item.nome}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {exactMatch && taken.has(exactMatch.id) && (
            <p role="note">O perfil já possui competência em {exactMatch.nome}. Edite o registro existente.</p>
          )}
          {offerInclusion && !technologyId && (
            <div role="note">
              <p style={{ margin: 0 }}>"{search.trim()}" não existe no vocabulário. Deseja incluí-la?</p>
              <label>
                Categoria
                <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as TechnologyCategory)}>
                  {TECHNOLOGY_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </label>{" "}
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void includeTechnology()}>
                Incluir no vocabulário
              </Button>
            </div>
          )}
          <label>
            Nível
            <select value={draft.nivel} onChange={(event) => setDraft({ ...draft, nivel: event.target.value as CompetencyLevel })}>
              {COMPETENCY_LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
            </select>
          </label>
          <label>
            Evidência
            <textarea
              value={draft.evidencia}
              maxLength={2000}
              placeholder="Projeto, entrega ou certificação que sustenta a competência"
              onChange={(event) => setDraft({ ...draft, evidencia: event.target.value })}
            />
          </label>
          <div>
            <Button type="submit" disabled={busy || !technologyId || draft.evidencia.trim().length < 10}>
              Registrar competência
            </Button>
          </div>
        </form>
      )}
    </article>
  );
}
