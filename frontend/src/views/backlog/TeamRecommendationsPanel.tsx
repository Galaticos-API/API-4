import { useState } from "react";
import { recommendForFeature, type FeatureRecommendationResult } from "../../api/api_team";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";

/** PBI-05.2.2: sugestão de profissionais por aderência explicável, sem alocação automática. */
export function TeamRecommendationsPanel({ featureId }: { featureId: string }) {
  const [result, setResult] = useState<FeatureRecommendationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setResult(await recommendForFeature(featureId));
    } catch {
      setError("Não foi possível calcular a recomendação de profissionais.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="ds-card" style={{ padding: "20px", marginTop: "16px" }} aria-label="Recomendação de profissionais">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>Profissionais com afinidade</h3>
        <Button variant="secondary" disabled={loading} onClick={() => void load()}>
          {loading ? "Calculando…" : result ? "Recalcular" : "Recomendar profissionais"}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
      {result && (
        <>
          <p role="note" className="muted" style={{ marginBottom: 0 }}>{result.aviso}</p>
          {!result.base_suficiente && <p role="status">{result.mensagem}</p>}
          {result.base_suficiente && (
            <>
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                Tecnologias consideradas: {result.tecnologias.map((item) => item.nome).join(", ")}. {result.criterio}
              </p>
              <ol aria-label="Profissionais sugeridos" style={{ display: "grid", gap: "10px", paddingLeft: "20px" }}>
                {result.recomendacoes.map((item) => (
                  <li key={item.desenvolvedor_id}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{item.nome}{item.senioridade ? ` (${item.senioridade})` : ""}</strong>
                      <span className="ds-badge ds-badge--brand">Sugestão · aderência {item.aderencia}%</span>
                      {item.ja_alocado_no_projeto && <span className="ds-badge">Já alocado no projeto</span>}
                      <Button variant="secondary" onClick={() => navigate(`/developers/${item.desenvolvedor_id}`)}>Abrir perfil</Button>
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>{item.justificativa}</p>
                  </li>
                ))}
              </ol>
            </>
          )}
        </>
      )}
    </section>
  );
}
