import { useRef, useState } from "react";
import { whoWorkedWith, type TeamExperienceAnswer } from "../../api/api_team";
import { competencyLevelLabel } from "../../models/competencies";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";

/** PBI-05.2.1: "quem já trabalhou com X?", com a evidência de cada profissional listado. */
export function TeamExperienceSearch() {
  const [term, setTerm] = useState("");
  const [answer, setAnswer] = useState<TeamExperienceAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const value = term.trim();
    if (!value) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    try {
      const result = await whoWorkedWith(value, current.signal);
      if (!current.signal.aborted) setAnswer(result);
    } catch {
      if (!current.signal.aborted) setError("Não foi possível consultar a experiência da equipe.");
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className="ds-card" style={{ padding: "20px", marginBottom: "20px" }} aria-label="Quem já trabalhou com uma tecnologia">
      <form onSubmit={search} style={{ display: "flex", gap: "8px", alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 260px" }}>
          Quem já trabalhou com…
          <input type="search" value={term} maxLength={100} placeholder="Ex.: integração PIX, React, PostgreSQL" onChange={(event) => setTerm(event.target.value)} />
        </label>
        <Button type="submit" disabled={loading || !term.trim()}>{loading ? "Consultando…" : "Consultar"}</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {answer && !answer.encontrado && <p role="status">{answer.resposta}</p>}
      {answer?.encontrado && (
        <div role="region" aria-label="Profissionais encontrados" style={{ marginTop: "12px", display: "grid", gap: "10px" }}>
          <p className="muted" style={{ margin: 0 }}>
            Experiência registrada em {answer.tecnologias.map((item) => item.nome).join(", ")}, com base em competências e alocações
            em projetos que você pode consultar.
          </p>
          {answer.profissionais.map((person) => (
            <article key={person.desenvolvedor_id} className="ds-card" style={{ padding: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                <strong>{person.nome}{person.senioridade ? ` (${person.senioridade})` : ""}</strong>
                <Button variant="secondary" onClick={() => navigate(`/developers/${person.desenvolvedor_id}`)}>Abrir perfil</Button>
              </div>
              <ul style={{ margin: "8px 0 0", paddingLeft: "18px" }}>
                {person.competencias.map((competency) => (
                  <li key={competency.tecnologia_id}>
                    Competência {competencyLevelLabel(competency.nivel).toLowerCase()} em {competency.tecnologia_nome}
                    {competency.evidencia ? `: ${competency.evidencia}` : ""}
                  </li>
                ))}
                {person.projetos.map((project) => (
                  <li key={project.projeto_id}>
                    Atuou em{" "}
                    <a href={`/projects/${project.projeto_id}`} onClick={(event) => { event.preventDefault(); navigate(`/projects/${project.projeto_id}`); }}>
                      {project.projeto_nome}
                    </a>
                    {project.papeis.length ? ` como ${project.papeis.join(", ")}` : ""}
                    {project.em_andamento ? " (em andamento)" : ""}, projeto que usa {project.tecnologias.map((item) => item.nome).join(", ")}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
