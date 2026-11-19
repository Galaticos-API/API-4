import { useState } from "react";
import { exportBacklogMarkdown, type MarkdownExportKind } from "../../api/api_backlog";
import { serverMessage } from "../../api/api_errors";
import { Button } from "../common/ui";

// S3-15 / PBI-01.5.5: baixa o épico (com features e PBIs) ou só a feature em Markdown.
export function downloadMarkdownFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportMarkdownButton({ kind, id }: { kind: MarkdownExportKind; id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const label = kind === "epics" ? "o épico" : "a feature";

  return (
    <>
      <Button
        variant="secondary"
        disabled={busy}
        title={`Baixar ${label} em Markdown, no formato do guia de especificação`}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            const file = await exportBacklogMarkdown(kind, id);
            downloadMarkdownFile(file.filename, file.content);
          } catch (error) {
            setMessage(serverMessage(error) ?? `Não foi possível exportar ${label}. Tente novamente.`);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Exportando…" : "Exportar Markdown"}
      </Button>
      {message && <p role="alert">{message}</p>}
    </>
  );
}
