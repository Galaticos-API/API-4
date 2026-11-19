import { useEffect, useMemo, useState } from "react";
import { listTechnologies, type TechnologyOption } from "../../api/api_backlog";
import { Button } from "../common/ui";
import { normalizeTechnologyName } from "../../models/technologies";

type LoadState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; items: TechnologyOption[] };

export function BacklogTechnologySelector({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadState>({ state: "loading" });
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setResult({ state: "loading" });
    listTechnologies(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setResult({ state: "ready", items });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ state: "error" });
      });
    return () => controller.abort();
  }, [attempt]);

  // Selecionadas continuam visíveis mesmo fora do filtro, para nunca sumirem da tela.
  const { visible, matches } = useMemo(() => {
    if (result.state !== "ready") return { visible: [], matches: 0 };
    const term = normalizeTechnologyName(filter);
    if (!term) return { visible: result.items, matches: result.items.length };
    const matching = result.items.filter((item) => normalizeTechnologyName(item.nome).includes(term));
    return {
      visible: result.items.filter((item) => value.includes(item.id) || matching.includes(item)),
      matches: matching.length,
    };
  }, [filter, result, value]);

  function toggle(id: string, checked: boolean) {
    onChange(
      checked
        ? [...new Set([...value, id])]
        : value.filter((current) => current !== id),
    );
  }

  return (
    <fieldset className="project-field backlog-technology-selector" disabled={disabled}>
      <legend>Tecnologias</legend>
      {result.state === "loading" && <p role="status">Carregando tecnologias…</p>}
      {result.state === "error" && (
        <div>
          <p role="alert">Não foi possível carregar o catálogo de tecnologias.</p>
          <Button type="button" variant="secondary" onClick={() => setAttempt((count) => count + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      {result.state === "ready" && result.items.length === 0 && (
        <p>Nenhuma tecnologia cadastrada no catálogo.</p>
      )}
      {result.state === "ready" && result.items.length > 0 && (
        <input
          type="search"
          aria-label="Filtrar tecnologias"
          placeholder="Digite para filtrar o vocabulário"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      {result.state === "ready" && result.items.length > 0 && filter && matches === 0 && (
        <p>Nenhuma tecnologia do vocabulário corresponde a "{filter}". Peça a inclusão a um administrador.</p>
      )}
      {result.state === "ready" && result.items.length > 0 && (
        <div className="backlog-technology-options">
          {visible.map((technology) => (
            <label key={technology.id}>
              <input
                type="checkbox"
                disabled={value.length >= 50 && !value.includes(technology.id)}
                checked={value.includes(technology.id)}
                onChange={(event) => toggle(technology.id, event.target.checked)}
              />
              {technology.nome}
            </label>
          ))}
        </div>
      )}
      {result.state === "ready" && result.items.length > 0 && (
        <small>{value.length}/50 tecnologias selecionadas</small>
      )}
    </fieldset>
  );
}
