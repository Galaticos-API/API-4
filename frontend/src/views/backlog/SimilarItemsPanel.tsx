import { useEffect, useRef, useState } from "react";
import {
  describeReuseError,
  reuseSimilarItem,
  searchSimilarItems,
  similarItemPath,
  SIMILAR_MIN_DRAFT_LENGTH,
  type SimilarItem,
  type SimilarKind,
} from "../../api/api_similar_items";
import "../../assets/styles/similar-items.css";
import { Alert, Badge, Button } from "../common/ui";

const KIND_LABEL: Record<SimilarKind, string> = { epico: "Épico", feature: "Feature", pbi: "PBI" };
const DEFAULT_DEBOUNCE_MS = 1200;

export interface SimilarItemsPanelProps {
  kind: SimilarKind;
  projectId: string;
  titulo: string;
  descricao: string;
  excludeId?: string;
  disabled?: boolean;
  canReuse?: boolean;
  debounceMs?: number;
  selectedId?: string | null;
  onSelect?: (item: SimilarItem | null) => void;
  reuseTargetId?: string;
  onReused?: () => void;
}

function percent(value: number): string {
  return `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
}

export function SimilarItemsPanel({
  kind,
  projectId,
  titulo,
  descricao,
  excludeId,
  disabled = false,
  canReuse = true,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  selectedId = null,
  onSelect,
  reuseTargetId,
  onReused,
}: SimilarItemsPanelProps) {
  const [items, setItems] = useState<SimilarItem[]>([]);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Record<string, true>>({});
  const mounted = useRef(true);
  const lock = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const text = [titulo, descricao].map((part) => part.trim()).filter(Boolean).join("\n");

  useEffect(() => {
    if (disabled || dismissed) return;
    if (text.length < SIMILAR_MIN_DRAFT_LENGTH) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchSimilarItems(projectId, {
        tipo: kind,
        titulo: titulo.trim() || undefined,
        descricao: descricao.trim() || undefined,
        excluir_id: excludeId,
      }, controller.signal)
        .then((result) => { if (!controller.signal.aborted) setItems(result.items); })
        .catch(() => { if (!controller.signal.aborted) setItems([]); });
    }, debounceMs);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [text, kind, projectId, excludeId, disabled, dismissed, debounceMs]);

  if (dismissed || items.length === 0) return null;

  const others = items.filter((item) => item.outro_projeto).length;
  const summary = `${items.length} ${items.length === 1 ? "item semelhante" : "itens semelhantes"} no acervo`
    + (others > 0 ? ` (${others} de ${others === 1 ? "outro projeto" : "outros projetos"})` : "");

  const reuse = async (item: SimilarItem) => {
    if (lock.current || !reuseTargetId) return;
    lock.current = true;
    setBusyId(item.id);
    setError("");
    try {
      await reuseSimilarItem(kind, reuseTargetId, item.id);
      if (!mounted.current) return;
      setDone((current) => ({ ...current, [item.id]: true }));
      onReused?.();
    } catch (caught) {
      if (mounted.current) setError(describeReuseError(caught));
    } finally {
      lock.current = false;
      if (mounted.current) setBusyId(null);
    }
  };

  return (
    <aside className="similar-panel" aria-label="Itens semelhantes no acervo">
      <div className="similar-head">
        <button
          type="button"
          className="similar-toggle"
          aria-expanded={open}
          aria-controls="similar-list"
          onClick={() => setOpen((value) => !value)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span>{" "}
          <span role="status" aria-live="polite">{summary}</span>
        </button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)} aria-label="Ocultar itens semelhantes">
          Ocultar
        </Button>
      </div>

      {open && (
        <div id="similar-list">
          <p className="muted similar-note">
            Sugestões do acervo para consulta. Nada é copiado sem a sua escolha, e o que for aproveitado chega como proposta editável.
          </p>
          <ul className="similar-list">
            {items.map((item) => {
              const href = similarItemPath(item);
              const selected = selectedId === item.id;
              const applied = done[item.id] === true || item.ja_aproveitado;
              return (
                <li className="similar-item" key={item.id} data-other-project={item.outro_projeto}>
                  <div className="similar-item-head">
                    <strong>{item.codigo ? `${item.codigo} · ` : ""}{item.titulo}</strong>
                    <span className="similar-badges">
                      <Badge tone={item.outro_projeto ? "warning" : "info"}>
                        {item.outro_projeto ? "Outro projeto" : "Este projeto"}
                      </Badge>
                      <Badge>{KIND_LABEL[item.tipo]}</Badge>
                      <Badge tone="ai">{percent(item.similaridade)} semelhante</Badge>
                    </span>
                  </div>
                  <p className="similar-origin"><span className="muted">Origem:</span> {item.origem}</p>
                  {item.trecho && <p className="similar-excerpt">{item.trecho}</p>}
                  <div className="similar-actions">
                    {href && <a href={href} target="_blank" rel="noopener noreferrer">Ver item (nova aba)</a>}
                    {applied && <Badge tone="success">Já aproveitado</Badge>}
                    {canReuse && !disabled && !applied && onSelect && (
                      selected
                        ? <Button type="button" variant="secondary" size="sm" onClick={() => onSelect(null)}>Desfazer escolha</Button>
                        : <Button type="button" variant="secondary" size="sm" onClick={() => onSelect(item)}>Aproveitar ao criar</Button>
                    )}
                    {canReuse && !disabled && !applied && reuseTargetId && (
                      <Button type="button" variant="secondary" size="sm" disabled={busyId !== null} onClick={() => reuse(item)}>
                        {busyId === item.id ? "Aproveitando…" : "Aproveitar"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {error && <Alert tone="danger" role="alert">{error}</Alert>}
        </div>
      )}
    </aside>
  );
}
export function SimilarSelection({ item, onClear, disabled }: { item: SimilarItem | null; onClear: () => void; disabled?: boolean }) {
  if (!item) return null;
  return (
    <p className="similar-selected" role="status">
      <strong>Será aproveitado ao criar:</strong> {item.titulo} — origem: {item.origem}. O conteúdo chegará como proposta editável
      nas sugestões do novo item e a relação de origem ficará registrada.{" "}
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>Desfazer</Button>
    </p>
  );
}

export async function reuseAfterCreate(kind: SimilarKind, createdId: string, origin: SimilarItem | null): Promise<void> {
  if (!origin) return;
  try {
    await reuseSimilarItem(kind, createdId, origin.id);
  } catch {
    // O item já existe; a pessoa pode aproveitar de novo pela tela de detalhe.
  }
}
