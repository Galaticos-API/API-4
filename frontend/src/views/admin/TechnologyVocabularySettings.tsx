import { useEffect, useMemo, useRef, useState } from "react";
import {
  TECHNOLOGY_CATEGORIES,
  TechnologyExistsError,
  TechnologyInUseError,
  createTechnology,
  listVocabulary,
  removeTechnology,
  type Technology,
  type TechnologyCategory,
  type TechnologyUsage,
} from "../../api/api_technologies";
import { Button } from "../common/ui";
import { normalizeTechnologyName } from "../../models/technologies";
import "../../assets/styles/organization-quality.css";

const categoryLabel = (value: string | null) =>
  TECHNOLOGY_CATEGORIES.find((category) => category.value === value)?.label ?? "Sem categoria";


type PendingRemoval = { technology: Technology; usage: TechnologyUsage; message: string };

export function TechnologyVocabularySettings() {
  const [items, setItems] = useState<Technology[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState<TechnologyCategory>("backend");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [existing, setExisting] = useState<Technology | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    // React StrictMode executa setup → cleanup → setup em desenvolvimento.
    // Rearmar a flag no setup evita suprimir para sempre os resultados das ações.
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listVocabulary(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setItems(value); })
      .catch(() => { if (!controller.signal.aborted) setError("Não foi possível carregar o vocabulário de tecnologias."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const visible = useMemo(() => {
    const term = normalizeTechnologyName(filter);
    return term ? items.filter((item) => normalizeTechnologyName(item.nome).includes(term)) : items;
  }, [filter, items]);

  const typedMatch = useMemo(() => {
    const term = normalizeTechnologyName(nome);
    return term ? items.find((item) => normalizeTechnologyName(item.nome) === term) ?? null : null;
  }, [items, nome]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !nome.trim()) return;
    setSaving(true);
    setError("");
    setMessage("");
    setExisting(null);
    try {
      const created = await createTechnology({ nome: nome.trim(), categoria });
      if (!mounted.current) return;
      setItems((current) => [...current, created].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setNome("");
      setMessage(`"${created.nome}" incluída no vocabulário e disponível para associação.`);
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof TechnologyExistsError) {
        setExisting(err.existing);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Não foi possível cadastrar a tecnologia.");
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  async function remove(technology: Technology, confirmed?: number) {
    setError("");
    setMessage("");
    try {
      const removed = await removeTechnology(technology.id, confirmed);
      if (!mounted.current) return;
      setItems((current) => current.filter((item) => item.id !== technology.id));
      setPendingRemoval(null);
      setMessage(
        removed.total > 0
          ? `"${technology.nome}" removida com ${removed.total} associação(ões).`
          : `"${technology.nome}" removida do vocabulário.`,
      );
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof TechnologyInUseError) {
        // A quantidade vem do servidor no momento da tentativa, nunca da lista em cache.
        setPendingRemoval({ technology, usage: err.usage, message: err.message });
      } else {
        setError(err instanceof Error ? err.message : "Não foi possível remover a tecnologia.");
      }
    }
  }

  return (
    <section className="ds-card organization-quality-settings" aria-label="Vocabulário de tecnologias">
      <h2>Vocabulário de tecnologias</h2>
      <p>
        Lista única usada para classificar itens de trabalho e competências. Variações de escrita como
        "Node.js" e "NodeJS" são tratadas como a mesma tecnologia.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {existing && (
        <p>
          Registro existente: <strong>{existing.nome}</strong> ({categoryLabel(existing.categoria)}). Utilize-o ao
          classificar itens e competências.{" "}
          <Button type="button" variant="secondary" onClick={() => { setFilter(existing.nome); setExisting(null); setError(""); }}>
            Mostrar na lista
          </Button>
        </p>
      )}

      <form onSubmit={create} className="technology-vocabulary-form">
        <label>
          Nome da tecnologia
          <input value={nome} maxLength={100} onChange={(event) => { setNome(event.target.value); setExisting(null); }} />
        </label>
        <label>
          Categoria
          <select value={categoria} onChange={(event) => setCategoria(event.target.value as TechnologyCategory)}>
            {TECHNOLOGY_CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </label>
        {typedMatch && (
          <small role="note">Já existe "{typedMatch.nome}" no vocabulário. Prefira utilizar o registro existente.</small>
        )}
        <Button type="submit" disabled={saving || !nome.trim()}>
          {saving ? "Incluindo…" : "Incluir tecnologia"}
        </Button>
      </form>

      <label>
        Filtrar vocabulário
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Digite para filtrar" />
      </label>
      {loading && <p role="status">Carregando vocabulário…</p>}
      {!loading && error && items.length === 0 && (
        <Button type="button" variant="secondary" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</Button>
      )}
      {!loading && visible.length === 0 && !error && <p>Nenhuma tecnologia encontrada.</p>}
      {!loading && visible.length > 0 && (
        <table className="technology-vocabulary-table">
          <thead>
            <tr><th>Tecnologia</th><th>Categoria</th><th>Competências</th><th>Itens</th><th><span className="sr-only">Ações</span></th></tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <tr key={item.id}>
                <td>{item.nome}</td>
                <td>{categoryLabel(item.categoria)}</td>
                <td>{item.uso.competencias}</td>
                <td>{item.uso.itens}</td>
                <td>
                  <Button type="button" variant="secondary" onClick={() => void remove(item)} aria-label={`Remover ${item.nome}`}>
                    Remover
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pendingRemoval && (
        <div role="alertdialog" aria-label={`Confirmar remoção de ${pendingRemoval.technology.nome}`}>
          <p>{pendingRemoval.message}</p>
          <p>
            Ao confirmar, {pendingRemoval.usage.competencias} competência(s) e {pendingRemoval.usage.itens} classificação(ões)
            de itens de trabalho deixam de existir. Essa ação não pode ser desfeita.
          </p>
          <Button type="button" onClick={() => void remove(pendingRemoval.technology, pendingRemoval.usage.total)}>
            Remover mesmo assim ({pendingRemoval.usage.total})
          </Button>{" "}
          <Button type="button" variant="secondary" onClick={() => setPendingRemoval(null)}>Cancelar</Button>
        </div>
      )}
    </section>
  );
}
