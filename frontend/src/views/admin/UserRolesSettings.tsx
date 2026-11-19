import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../api/api_auth";
import { changeUserRole, listUserRoles, type PlatformUserRole } from "../../api/api_admin_users";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "../../models/permissions";
import { Button } from "../common/ui";
import "../../assets/styles/organization-quality.css";

const SOLE_ADMIN_NOTE = "Único administrador ativo: defina outro administrador antes de alterar este perfil.";

function describeChange(user: PlatformUserRole): string {
  if (!user.papel_alterado_em) return "Perfil sem alteração registrada.";
  const when = new Date(user.papel_alterado_em).toLocaleString("pt-BR");
  return `Última alteração por ${user.papel_alterado_por_nome ?? "usuário removido"} em ${when}.`;
}

export function UserRolesSettings() {
  const [users, setUsers] = useState<PlatformUserRole[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserRole>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const mounted = useRef(false);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listUserRoles(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setUsers(items);
        setDrafts(Object.fromEntries(items.map((user) => [user.id, user.role])));
      })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar os usuários da plataforma."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const activeAdmins = users.filter((user) => user.role === "admin" && user.ativo).length;

  async function save(user: PlatformUserRole) {
    const role = drafts[user.id];
    if (!role || role === user.role || savingId) return;
    setSavingId(user.id);
    setError("");
    setMessage("");
    try {
      const result = await changeUserRole(user.id, role);
      if (!mounted.current) return;
      setUsers((current) => current.map((item) => (item.id === user.id ? result.usuario : item)));
      setDrafts((current) => ({ ...current, [user.id]: result.usuario.role }));
      setMessage(`${result.usuario.nome}: ${result.message}`);
    } catch (err) {
      if (!mounted.current) return;
      const details = err instanceof ApiError ? (err.details as { error?: string } | undefined) : undefined;
      setError(err instanceof ApiError && err.status === 409
        ? details?.error ?? SOLE_ADMIN_NOTE
        : details?.error ?? "Não foi possível alterar o perfil. Tente novamente.");
      setDrafts((current) => ({ ...current, [user.id]: user.role }));
    } finally {
      if (mounted.current) setSavingId(null);
    }
  }

  return (
    <section className="ds-card organization-quality-settings" aria-label="Perfis de acesso">
      <h2>Perfis de acesso</h2>
      <p>
        Defina o perfil de cada pessoa. A alteração vale a partir do próximo acesso do usuário
        e fica registrada com autor e data. O perfil desenvolvedor consulta os itens de trabalho sem editar.
      </p>
      {loading && <p role="status">Carregando usuários…</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <Button variant="secondary" disabled={loading || savingId !== null} onClick={() => setAttempt((value) => value + 1)}>
        Recarregar usuários
      </Button>
      {!loading && users.length > 0 && (
        <ul className="user-roles-list" style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: "12px" }}>
          {users.map((user) => {
            const soleAdmin = user.role === "admin" && user.ativo && activeAdmins <= 1;
            const draft = drafts[user.id] ?? user.role;
            const selectId = `user-role-${user.id}`;
            const noteId = `user-role-note-${user.id}`;
            return (
              <li key={user.id} className="ds-card" style={{ padding: "16px" }} aria-label={user.nome}>
                <strong>{user.nome}</strong>{!user.ativo && " (inativo)"}
                <div className="muted" style={{ fontSize: "0.85rem" }}>{user.email}</div>
                <div className="ds-field" style={{ marginTop: "8px" }}>
                  <label htmlFor={selectId}>Perfil de {user.nome}</label>
                  <select
                    id={selectId}
                    className="ds-input"
                    value={draft}
                    disabled={soleAdmin || savingId !== null}
                    aria-describedby={noteId}
                    onChange={(event) => setDrafts((current) => ({ ...current, [user.id]: event.target.value as UserRole }))}
                  >
                    {USER_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </div>
                <p id={noteId} className="muted" style={{ fontSize: "0.85rem" }}>
                  {soleAdmin ? SOLE_ADMIN_NOTE : describeChange(user)}
                </p>
                <Button disabled={soleAdmin || draft === user.role || savingId !== null} onClick={() => void save(user)}>
                  {savingId === user.id ? "Salvando perfil…" : `Salvar perfil de ${user.nome}`}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && !error && users.length === 0 && <p>Nenhum usuário cadastrado.</p>}
    </section>
  );
}
