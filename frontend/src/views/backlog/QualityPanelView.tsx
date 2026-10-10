import { useState } from "react";
import { RealtimeQualityCheck, RealtimeQualityReport } from "../../models/qualityEngine";
import { Button } from "../common/ui";

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

export function QualityPanelView({
  report,
  title = "Painel de Qualidade",
  defaultExpanded = true,
}: QualityPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const getBadgeClass = (score: number | null) => {
    if (score === null) return "ds-badge--warning";
    if (score >= 80) return "ds-badge--success";
    if (score >= 50) return "ds-badge--warning";
    return "ds-badge--danger";
  };

  const statusGeral = report.has_blocking_issues
    ? { texto: "Pendências impeditivas", classe: "ds-badge--danger" }
    : report.checks.some((c) => !c.passed)
      ? { texto: "Conforme com alertas", classe: "ds-badge--warning" }
      : { texto: "Em conformidade", classe: "ds-badge--success" };

  return (
    <section className="ds-card ds-card--glass quality-panel" aria-label={title}>
      <header className="quality-panel-header">
        <div className="quality-panel-header-left">
          <span className="projects-eyebrow">
            Conformidade e maturidade
          </span>
          <h4 className="quality-panel-title">{title}</h4>
        </div>

        <div className="quality-panel-header-right">
          <span className={`ds-badge ${statusGeral.classe}`} role="status">
            {statusGeral.texto}
          </span>

          {report.score_completude !== null && (
            <span
              className={`ds-badge ${getBadgeClass(
                report.score_completude,
              )}`}
            >
              {report.score_completude}% completo
            </span>
          )}

          <Button
            type="button"
            variant="secondary" className="quality-toggle-btn"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="quality-checklist-content"
          >
            {expanded
              ? "Recolher painel"
              : "Abrir painel de qualidade"}
          </Button>
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
                    className={`quality-check-item ${check.passed
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
                        <Button
                          type="button"
                          variant="secondary" className="quality-nav-btn"
                          onClick={() =>
                            scrollToField(check.target_field_id)
                          }
                          title={`Ir diretamente para o campo de ${check.check_name}`}
                          aria-label={`Corrigir ${check.check_name}`}
                        >
                          Corrigir campo →
                        </Button>
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
