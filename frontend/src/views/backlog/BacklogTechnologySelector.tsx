import { useEffect, useState } from "react";
import { listTechnologies, type TechnologyOption } from "../../api/api_backlog";

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
          <button type="button" className="btn-secondary" onClick={() => setAttempt((count) => count + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {result.state === "ready" && result.items.length === 0 && (
        <p>Nenhuma tecnologia cadastrada no catálogo.</p>
      )}
      {result.state === "ready" && result.items.length > 0 && (
        <div className="backlog-technology-options">
          {result.items.map((technology) => (
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
