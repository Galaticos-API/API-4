import React, { useEffect, useState, useCallback } from "react";
import { CompetenciesPanel } from "./CompetenciesPanel";
import { AllocationsPanel } from "./AllocationsPanel";
import { Button } from "../common/ui";
import { ApiError } from "../../api/api_auth";
import {
  createDeveloperProfile,
  getDeveloperProfile,
  listDevelopersOverview,
  listLinkableUsers,
  updateDeveloperProfile,
  type DeveloperConsolidatedProfile,
  type DeveloperProfileSummary,
  type LinkablePlatformUser,
} from "../../api/api_developers";
import { navigate } from "../../models/navigation";

const SENIORITY_OPTIONS = ["Junior", "Pleno", "Senior", "Especialista", "Tech Lead"] as const;

interface ExistingProfileConflict {
  id: string;
  nome: string;
  senioridade: string | null;
  bio?: string | null;
  usuario_id?: string | null;
}

interface DevelopersViewProps {
  pathname?: string;
  canManage?: boolean;
}

function parseDeveloperIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/developers\/([a-zA-Z0-9_-]+)$/);
  return match ? match[1] : null;
}

function formatDatePtBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("pt-BR");
}

export const DevelopersView: React.FC<DevelopersViewProps> = ({
  pathname = window.location.pathname,
  canManage = false,
}) => {
  const selectedDeveloperId = parseDeveloperIdFromPath(pathname);

  const [developers, setDevelopers] = useState<DeveloperProfileSummary[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<LinkablePlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Consolidated profile state
  const [profile, setProfile] = useState<DeveloperConsolidatedProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Form state (create / edit)
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [senioridade, setSenioridade] = useState("Pleno");
  const [bio, setBio] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [conflictProfile, setConflictProfile] = useState<ExistingProfileConflict | null>(null);

  const loadOverview = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const overview = await listDevelopersOverview(signal);
      if (signal?.aborted) return;
      setDevelopers(overview.desenvolvedores);

      if (canManage) {
        try {
          const users = await listLinkableUsers(signal);
          if (!signal?.aborted) setLinkableUsers(users);
        } catch {
          // Non-fatal if user list cannot be loaded
        }
      }
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os perfis profissionais.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [canManage]);

  const loadConsolidatedProfile = useCallback(async (id: string, signal?: AbortSignal) => {
    setProfileLoading(true);
    setProfileError("");
    try {
      const data = await getDeveloperProfile(id, signal);
      if (!signal?.aborted) setProfile(data);
    } catch (err: unknown) {
      if (signal?.aborted) return;
      setProfile(null);
      setProfileError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar o perfil consolidado do desenvolvedor.",
      );
    } finally {
      if (!signal?.aborted) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadOverview(controller.signal);
    return () => controller.abort();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedDeveloperId) {
      setProfile(null);
      setProfileError("");
      return;
    }
    const controller = new AbortController();
    void loadConsolidatedProfile(selectedDeveloperId, controller.signal);
    return () => controller.abort();
  }, [selectedDeveloperId, loadConsolidatedProfile]);

  const resetForm = () => {
    setEditingId(null);
    setNome("");
    setSenioridade("Pleno");
    setBio("");
    setUsuarioId("");
    setFormError("");
    setConflictProfile(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setFormSuccess("");
    setShowForm(true);
  };

  const handleOpenEdit = (target: DeveloperProfileSummary | DeveloperConsolidatedProfile) => {
    setEditingId(target.id);
    setNome(target.nome);
    setSenioridade(target.senioridade || "Pleno");
    setBio(target.bio || "");
    setUsuarioId(target.usuario_id || "");
    setFormError("");
    setFormSuccess("");
    setConflictProfile(null);
    setShowForm(true);
  };

  const handleUserSelectionChange = (nextUserId: string) => {
    setUsuarioId(nextUserId);
    setConflictProfile(null);
    setFormError("");
    if (nextUserId && !nome.trim()) {
      const matched = linkableUsers.find((u) => u.id === nextUserId);
      if (matched) setNome(matched.nome);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError("");
    setFormSuccess("");
    setConflictProfile(null);

    try {
      const payload = {
        nome: nome.trim() || undefined,
        senioridade: senioridade.trim() || null,
        bio: bio.trim() || null,
        usuario_id: usuarioId.trim() ? usuarioId.trim() : null,
      };

      if (editingId) {
        const updated = await updateDeveloperProfile(editingId, payload);
        setFormSuccess(`Perfil profissional de "${updated.nome}" atualizado com sucesso.`);
        setShowForm(false);
        await loadOverview();
        if (selectedDeveloperId === editingId) {
          await loadConsolidatedProfile(editingId);
        }
      } else {
        const created = await createDeveloperProfile(payload);
        setFormSuccess(`Perfil profissional de "${created.nome}" criado com sucesso.`);
        setShowForm(false);
        resetForm();
        await loadOverview();
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const details = err.details as {
          error?: string;
          code?: string;
          details?: { existing_profile?: ExistingProfileConflict };
        } | undefined;
        const existing = details?.details?.existing_profile;
        if (err.status === 409 && existing) {
          setConflictProfile(existing);
        }
        setFormError(
          details?.error || err.message || "Não foi possível salvar o perfil profissional.",
        );
      } else {
        setFormError(
          err instanceof Error ? err.message : "Não foi possível salvar o perfil profissional.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredDevelopers = developers.filter((dev) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return (
      dev.nome.toLowerCase().includes(query) ||
      (dev.senioridade ?? "").toLowerCase().includes(query) ||
      (dev.bio ?? "").toLowerCase().includes(query)
    );
  });

  return (
    <div className="page-container" style={{ paddingBottom: "48px" }}>
      <div className="head-section" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow">MEMÓRIA DA EQUIPE · EP-05</div>
          <h1>Perfis Profissionais & Competências</h1>
          <p className="muted">
            Consulte o histórico consolidado de atuação da equipe e mantenha perfis vinculados exclusivamente a informações de natureza profissional.
          </p>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {selectedDeveloperId && (
            <Button variant="secondary" onClick={() => navigate("/developers")}>
              ← Todos os perfis
            </Button>
          )}
          {canManage && (
            <Button variant="primary" onClick={handleOpenCreate}>
              Novo perfil profissional
            </Button>
          )}
        </div>
      </div>

      {formSuccess && (
        <div
          role="status"
          className="ds-card"
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            borderColor: "rgba(16, 185, 129, 0.35)",
            margin: "16px 0",
            color: "#6ee7b7",
          }}
        >
          {formSuccess}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="ds-card"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            borderColor: "rgba(239, 68, 68, 0.35)",
            margin: "16px 0",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {/* Formulário de Cadastro / Edição (PBI-05.1.1) */}
      {showForm && canManage && (
        <section
          className="ds-card"
          aria-labelledby="developer-form-title"
          style={{ marginTop: "20px", marginBottom: "24px", padding: "24px" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h2 id="developer-form-title" style={{ fontSize: "1.25rem", margin: 0 }}>
              {editingId ? "Editar perfil profissional" : "Cadastrar perfil profissional"}
            </h2>
            <Button variant="secondary" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancelar
            </Button>
          </div>

          <p className="muted" style={{ fontSize: "0.88rem", marginBottom: "16px" }}>
            <strong>Uso responsável de dados (LGPD):</strong> Registre apenas informações de natureza profissional (nome profissional, senioridade, resumo técnico e vínculo institucional). Não insira CPF, RG, endereço residencial, telefone pessoal ou dados salariais.
          </p>

          {formError && (
            <div
              role="alert"
              className="ds-card"
              style={{
                background: "rgba(239, 68, 68, 0.12)",
                borderColor: "rgba(239, 68, 68, 0.4)",
                marginBottom: "16px",
                color: "#fca5a5",
              }}
            >
              <p style={{ margin: 0 }}>{formError}</p>
              {conflictProfile && (
                <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span>
                    Perfil existente identificado: <strong>{conflictProfile.nome}</strong>
                    {conflictProfile.senioridade ? ` (${conflictProfile.senioridade})` : ""}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setShowForm(false);
                      navigate(`/developers/${conflictProfile.id}`);
                    }}
                  >
                    Abrir perfil existente
                  </Button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="ds-grid ds-grid--two" style={{ gap: "16px" }}>
              <div className="ds-field">
                <label htmlFor="dev-usuario-select">Vincular a usuário da plataforma (opcional)</label>
                <select
                  id="dev-usuario-select"
                  className="ds-input"
                  value={usuarioId}
                  onChange={(e) => handleUserSelectionChange(e.target.value)}
                  disabled={submitting}
                >
                  <option value="">Sem vínculo de conta (ou vincular depois)</option>
                  {linkableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.role.toUpperCase()})
                      {u.perfil_id && u.perfil_id !== editingId ? " — Já possui perfil vinculado" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ds-field">
                <label htmlFor="dev-nome-input">Nome profissional *</label>
                <input
                  id="dev-nome-input"
                  type="text"
                  className="ds-input"
                  placeholder="Ex.: Rafael Matesco"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required={!usuarioId}
                  maxLength={255}
                  disabled={submitting}
                />
              </div>

              <div className="ds-field">
                <label htmlFor="dev-senioridade-select">Senioridade</label>
                <select
                  id="dev-senioridade-select"
                  className="ds-input"
                  value={senioridade}
                  onChange={(e) => setSenioridade(e.target.value)}
                  disabled={submitting}
                >
                  {SENIORITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ds-field" style={{ marginTop: "16px" }}>
              <label htmlFor="dev-bio-textarea">Resumo profissional</label>
              <textarea
                id="dev-bio-textarea"
                className="ds-input"
                rows={3}
                placeholder="Descreva a atuação técnica, arquitetura, linguagens e domínios de experiência profissional..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={2000}
                disabled={submitting}
              />
            </div>

            <div style={{ marginTop: "20px", display: "flex", gap: "12px" }}>
              <Button type="submit" variant="primary" disabled={submitting}>
                {submitting
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Confirmar cadastro"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {/* Visão de Perfil Consolidado (PBI-05.1.4) */}
      {selectedDeveloperId ? (
        <section aria-label="Perfil profissional consolidado" style={{ marginTop: "20px" }}>
          {profileLoading ? (
            <div className="ds-card" role="status">
              Carregando perfil consolidado…
            </div>
          ) : profileError ? (
            <div className="ds-card" role="alert" style={{ borderColor: "rgba(239, 68, 68, 0.4)", color: "#fca5a5" }}>
              <p>{profileError}</p>
              <Button variant="secondary" onClick={() => navigate("/developers")}>
                Voltar para a lista de perfis
              </Button>
            </div>
          ) : profile ? (
            <div style={{ display: "grid", gap: "20px" }}>
              {/* Cabeçalho do Perfil */}
              <article className="ds-card" style={{ padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <h2 style={{ fontSize: "1.6rem", margin: 0 }}>{profile.nome}</h2>
                      {profile.senioridade && (
                        <span className="ds-badge ds-badge--brand">{profile.senioridade}</span>
                      )}
                      {profile.usuario_id ? (
                        <span className="ds-badge ds-badge--success">
                          Usuário vinculado: {profile.usuario_nome || profile.nome}
                          {profile.role ? ` (${profile.role.toUpperCase()})` : ""}
                        </span>
                      ) : (
                        <span className="ds-badge">Sem conta vinculada</span>
                      )}
                    </div>
                    <p style={{ marginTop: "12px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {profile.bio || "Sem resumo profissional cadastrado."}
                    </p>
                  </div>

                  {canManage && (
                    <Button variant="secondary" onClick={() => handleOpenEdit(profile)}>
                      Editar perfil / vínculo
                    </Button>
                  )}
                </div>
              </article>

              <CompetenciesPanel
                developerId={profile.id}
                competencias={profile.competencias}
                canManage={canManage}
                onChanged={() => { void loadConsolidatedProfile(profile.id); void loadOverview(); }}
              />

              <AllocationsPanel
                developerId={profile.id}
                alocacoes={profile.alocacoes}
                canManage={canManage}
                onChanged={() => { void loadConsolidatedProfile(profile.id); void loadOverview(); }}
              />

              {/* Histórico Consolidado de Atuação (PBI-05.1.4 / PBI-05.2.3) */}
              <article className="ds-card" style={{ padding: "24px" }}>
                <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
                  Histórico Consolidado de Atuação ({profile.historico_consolidado.length})
                </h3>
                {profile.historico_consolidado.length === 0 ? (
                  <p className="muted">
                    O histórico consolidado é derivado automaticamente das alocações em projetos.
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: "16px" }}>
                    {profile.historico_consolidado.map((item) => (
                      <div
                        key={item.projeto_id}
                        className="ds-card"
                        style={{ padding: "18px", background: "rgba(255, 255, 255, 0.02)" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: "1.1rem" }}>{item.projeto_nome}</h4>
                            {item.projeto_descricao && (
                              <p className="muted" style={{ margin: "6px 0", fontSize: "0.9rem" }}>
                                {item.projeto_descricao}
                              </p>
                            )}
                            <p className="muted" style={{ margin: "6px 0", fontSize: "0.85rem" }}>
                              Papéis exercidos:{" "}
                              <strong>
                                {item.papeis.length > 0 ? item.papeis.join(", ") : "Desenvolvedor"}
                              </strong>{" "}
                              · Atuação desde {formatDatePtBr(item.primeira_alocacao)}{" "}
                              {item.em_andamento
                                ? "(atualmente alocado)"
                                : item.ultima_alocacao
                                  ? `até ${formatDatePtBr(item.ultima_alocacao)}`
                                  : ""}
                            </p>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => navigate(`/projects/${item.projeto_id}`)}
                          >
                            Ver projeto: {item.projeto_nome}
                          </Button>
                        </div>

                        {item.tecnologias.length > 0 && (
                          <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {item.tecnologias.map((tech) => (
                              <span key={tech.id} className="ds-badge ds-badge--brand">
                                {tech.nome}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          ) : null}
        </section>
      ) : (
        /* Listagem de Perfis Profissionais */
        <section aria-label="Lista de perfis profissionais" style={{ marginTop: "20px" }}>
          <div className="ds-field" style={{ marginBottom: "20px", maxWidth: "460px" }}>
            <label htmlFor="search-developers-input">Buscar profissional</label>
            <input
              id="search-developers-input"
              type="search"
              className="ds-input"
              placeholder="Filtrar por nome, senioridade ou resumo profissional..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {loading ? (
            <div className="ds-card" role="status">
              Carregando perfis profissionais…
            </div>
          ) : filteredDevelopers.length === 0 ? (
            <div className="ds-card">
              <p className="muted" style={{ margin: 0 }}>
                Nenhum perfil profissional encontrado.
              </p>
            </div>
          ) : (
            <div className="ds-grid ds-grid--two" style={{ gap: "16px" }}>
              {filteredDevelopers.map((dev) => (
                <article key={dev.id} className="ds-card" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: "1.2rem" }}>{dev.nome}</h3>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {dev.senioridade && (
                          <span className="ds-badge ds-badge--brand">{dev.senioridade}</span>
                        )}
                        {dev.usuario_id ? (
                          <span className="ds-badge ds-badge--success">Conta vinculada</span>
                        ) : (
                          <span className="ds-badge">Sem vínculo</span>
                        )}
                      </div>
                    </div>

                    <p className="muted" style={{ marginTop: "10px", marginBottom: "12px", fontSize: "0.9rem" }}>
                      {dev.bio || "Sem resumo profissional informado."}
                    </p>

                    <div style={{ display: "flex", gap: "16px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      <span>
                        <strong>{dev.competencias_count}</strong> competência(s)
                      </span>
                      <span>
                        <strong>{dev.alocacoes_count}</strong> alocação(ões)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <Button
                      variant="primary"
                      onClick={() => navigate(`/developers/${dev.id}`)}
                    >
                      Consultar perfil consolidado
                    </Button>
                    {canManage && (
                      <Button variant="secondary" onClick={() => handleOpenEdit(dev)}>
                        Editar
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
