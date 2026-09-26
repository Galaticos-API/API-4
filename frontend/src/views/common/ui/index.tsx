import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type BadgeTone = "must" | "should" | "could" | "success" | "warning" | "danger" | "info" | "ai" | "brand";

export function Button({
  variant = "primary",
  size,
  className = "",
  ...props
}: React.ComponentPropsWithRef<"button"> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return (
    <button
      className={`ds-button ds-button--${variant}${size === "sm" ? " ds-button--sm" : ""} ${className}`.trim()}
      {...props}
    />
  );
}

export function Badge({
  tone,
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return (
    <span className={`ds-badge${tone ? ` ds-badge--${tone}` : ""}`}>
      {children}
    </span>
  );
}

export function Alert({
  tone = "info",
  title,
  role,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  role?: "status" | "alert";
  children: React.ReactNode;
}) {
  return (
    <div className={`ds-alert ds-alert--${tone}`} role={role ?? (tone === "danger" ? "alert" : "status")}>
      {title && <strong>{title}</strong>}
      <div>{children}</div>
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

export function Progress({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
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
      <Badge tone="ai">Sugestão da IA</Badge>
      <div style={{ marginTop: 12 }}>{children}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <Button onClick={onAccept}>Aceitar</Button>
        <Button variant="secondary" onClick={onEdit}>Editar antes de aceitar</Button>
        <Button variant="ghost" onClick={onDiscard}>Descartar</Button>
      </div>
    </section>
  );
}
