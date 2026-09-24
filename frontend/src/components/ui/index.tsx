import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm";
export type BadgeTone = "brand" | "success" | "warning" | "danger" | "info";
type AlertTone = "danger" | "warning" | "success" | "neutral";

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type={type}
      className={`ds-button ds-button--${variant}${size === "sm" ? " ds-button--sm" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function Badge({ tone, children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={`ds-badge${tone ? ` ds-badge--${tone}` : ""}`}>{children}</span>;
}

export function Progress({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="ds-progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
    >
      <span style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Field({
  label,
  help,
  error,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ds-field">
      <span className="ds-label">{label}</span>
      {children}
      {error ? (
        <span className="ds-help ds-help--error" role="alert">
          {error}
        </span>
      ) : help ? (
        <span className="ds-help">{help}</span>
      ) : null}
    </label>
  );
}

export function Alert({
  tone = "neutral",
  title,
  children,
  role = "status",
}: {
  tone?: AlertTone;
  title?: string;
  children?: React.ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`ds-alert${tone === "neutral" ? "" : ` ds-alert--${tone}`}`} role={role}>
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="ds-empty">
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function AISuggestion({
  children,
  onAccept,
  onEdit,
  onDiscard,
}: {
  children: React.ReactNode;
  onAccept?: () => void;
  onEdit?: () => void;
  onDiscard?: () => void;
}) {
  return (
    <section className="ds-ai-suggestion" aria-label="Sugestão da IA">
      <Badge tone="brand">Sugestão da IA</Badge>
      <div style={{ marginTop: 12 }}>{children}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Button onClick={onAccept}>Aceitar</Button>
        <Button variant="secondary" onClick={onEdit}>Editar antes de aceitar</Button>
        <Button variant="ghost" onClick={onDiscard}>Descartar</Button>
      </div>
    </section>
  );
}
