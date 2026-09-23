import { useState } from "react";
import { RealtimeQualityReport, RealtimeQualityCheck } from "./qualityEngine";

export interface QualityPanelProps {
  report: RealtimeQualityReport;
  title?: string;
  defaultExpanded?: boolean;
}

export function scrollToField(fieldId: string): boolean {
  if (typeof document === "undefined") return false;
  const element = document.getElementById(fieldId);
  if (!element) return false;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus();

  // Aplica destaque temporário para feedback visual imediato
  element.classList.add("field-target-highlight");
  setTimeout(() => {
    element.classList.remove("field-target-highlight");
  }, 2200);

  return true;
}

export function QualityPanel({
  report,
  title = "Painel de Qualidade",
  defaultExpanded = true,
}: QualityPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const getBadgeClass = (score: number | null) => {
    if (score === null) return "badge-warning";
    if (score >= 80) return "badge-success";
    if (score >= 50) return "badge-warning";
    return "badge-error";
  };

  const statusGeral = report.has_blocking_issues
    ? { texto: "Pendências impeditivas", classe: "badge-error" }
    : report.checks.some((c) => !c.passed)
      ? { texto: "Conforme com alertas", classe: "badge-warning" }
      : { texto: "Em conformidade", classe: "badge-success" };

  return (
    <section className="glass-panel quality-panel" aria-label={title}>
      <header className="quality-panel-header">
        <div className="quality-panel-header-left">
          <span className="projects-eyebrow">
            Conformidade e maturidade
          </span>
          <h4 className="quality-panel-title">{title}</h4>
        </div>

        <div className="quality-panel-header-right">
          <span className={`badge ${statusGeral.classe}`} role="status">
            {statusGeral.texto}
          </span>

          {report.score_completude !== null && (
            <span
              className={`badge ${getBadgeClass(
                report.score_completude,
              )}`}
            >
              {report.score_completude}% completo
            </span>
          )}

          <button
            type="button"
            className="btn-secondary quality-toggle-btn"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="quality-checklist-content"
          >
            {expanded
              ? "Recolher painel"
              : "Abrir painel de qualidade"}
          </button>
        </div>
      </header>

      {expanded && (
        <div
          id="quality-checklist-content"
          className="quality-panel-body"
        >
          <div className="quality-rules-notice">
            <p className="quality-help-text">
              <strong>Bloqueio apenas na conclusão:</strong>{" "}
              você pode salvar rascunhos livremente a qualquer
              momento. As verificações marcadas com{" "}
              <em>[Bloqueia conclusão]</em> são exigidas
              exclusivamente para marcar o item como concluído.
            </p>
          </div>

          <ul className="quality-checklist" role="list">
            {report.checks.map(
              (check: RealtimeQualityCheck) => {
                const isAlertOnly =
                  !check.is_blocking && !check.passed;

                return (
                  <li
                    key={check.check_id}
                    className={`quality-check-item ${
                      check.passed
                        ? "passed"
                        : isAlertOnly
                          ? "warning"
                          : "failed"
                    }`}
                    data-testid={`quality-check-${check.check_id}`}
                  >
                    <div className="quality-check-indicator">
                      {check.passed ? (
                        <span
                          className="quality-icon success"
                          aria-label="Aprovado"
                        >
                          ✓
                        </span>
                      ) : isAlertOnly ? (
                        <span
                          className="quality-icon warning"
                          aria-label="Alerta"
                        >
                          ⚠
                        </span>
                      ) : (
                        <span
                          className="quality-icon danger"
                          aria-label="Reprovado"
                        >
                          ✗
                        </span>
                      )}
                    </div>

                    <div className="quality-check-info">
                      <div className="quality-check-title-row">
                        <strong className="quality-check-name">
                          {check.check_name}
                        </strong>

                        {check.is_blocking ? (
                          <span className="quality-badge-tag blocking">
                            Bloqueia conclusão
                          </span>
                        ) : (
                          <span className="quality-badge-tag alert">
                            Alerta informativo
                          </span>
                        )}
                      </div>

                      <p className="quality-check-message">
                        {check.message}
                      </p>
                    </div>

                    {!check.passed && (
                      <div className="quality-check-action">
                        <button
                          type="button"
                          className="btn-secondary quality-nav-btn"
                          onClick={() =>
                            scrollToField(check.target_field_id)
                          }
                          title={`Ir diretamente para o campo de ${check.check_name}`}
                          aria-label={`Corrigir ${check.check_name}`}
                        >
                          Corrigir campo →
                        </button>
                      </div>
                    )}
                  </li>
                );
              },
            )}
          </ul>
        </div>
      )}
    </section>
  );
}