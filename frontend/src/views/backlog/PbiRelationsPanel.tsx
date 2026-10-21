import React, { useEffect, useState } from "react";
import {
  createPbiRelation,
  deletePbiRelation,
  getPbiRelations,
  type PbiRelation,
  type PbiRelationType,
} from "../../api/api_backlog";
import { getProjectBacklogTree } from "../../api/api_backlog_tree";
import { Alert, Badge, Button, EmptyState } from "../common/ui";

export interface PbiRelationsPanelProps {
  pbiId: string;
  projectId: string;
  canEdit: boolean;
  readOnly: boolean;
}

interface CandidatePbi {
  id: string;
  codigo: string;
  titulo: string;
}

export function PbiRelationsPanel({
  pbiId,
  projectId,
  canEdit,
  readOnly,
}: PbiRelationsPanelProps) {
  const [relations, setRelations] = useState<PbiRelation[]>([]);
  const [candidates, setCandidates] = useState<CandidatePbi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targetPbiId, setTargetPbiId] = useState("");
  const [relationType, setRelationType] = useState<PbiRelationType>("depende_de");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Load relations and candidate PBIs
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      getPbiRelations(pbiId, controller.signal),
      getProjectBacklogTree(projectId, controller.signal).catch(() => null),
    ])
      .then(([rels, tree]) => {
        if (controller.signal.aborted) return;
        setRelations(rels);

        if (tree && Array.isArray(tree.epics)) {
          const pbis: CandidatePbi[] = [];
          for (const epic of tree.epics) {
            for (const feat of epic.features || []) {
              for (const p of feat.pbis || []) {
                if (p.id !== pbiId) {
                  pbis.push({
                    id: p.id,
                    codigo: p.codigo,
                    titulo: p.titulo,
                  });
                }
              }
            }
          }
          setCandidates(pbis);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err?.message || "Não foi possível carregar as relações do PBI.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [pbiId, projectId, reloadTrigger]);

  const handleAddRelation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPbiId) {
      setActionError("Selecione um PBI para relacionar.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await createPbiRelation(pbiId, targetPbiId, relationType);
      setActionSuccess("Relação criada com sucesso.");
      setTargetPbiId("");
      setReloadTrigger((v) => v + 1);
    } catch (err: any) {
      setActionError(err?.message || "Erro ao criar relação entre PBIs.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRelation = async (relationId: string) => {
    setDeletingId(relationId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await deletePbiRelation(pbiId, relationId);
      setActionSuccess("Relação removida com sucesso.");
      setReloadTrigger((v) => v + 1);
    } catch (err: any) {
      setActionError(err?.message || "Erro ao remover relação.");
    } finally {
      setDeletingId(null);
    }
  };

  const getBadgeTone = (tipo: PbiRelationType) => {
    switch (tipo) {
      case "depende_de":
        return "warning";
      case "substitui":
        return "danger";
      case "similar_a":
        return "info";
      default:
        return undefined;
    }
  };

  return (
    <section className="ds-card" style={{ marginTop: "24px" }} aria-labelledby={`relations-title-${pbiId}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div>
          <h3 id={`relations-title-${pbiId}`} style={{ margin: 0 }}>Relações do PBI</h3>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.9rem" }}>
            Mapeamento bidirecional de dependências com detecção de ciclo, similaridades e substituições.
          </p>
        </div>
      </div>

      {readOnly && (
        <Alert tone="warning">
          Item ou projeto arquivado: as relações estão disponíveis apenas para consulta.
        </Alert>
      )}

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {actionError && (
        <div style={{ margin: "12px 0" }}>
          <Alert tone="danger" role="alert">
            {actionError}
          </Alert>
        </div>
      )}

      {actionSuccess && (
        <div style={{ margin: "12px 0" }}>
          <Alert tone="success" role="status">
            {actionSuccess}
          </Alert>
        </div>
      )}

      {/* Formulário para adicionar nova relação */}
      {canEdit && !readOnly && (
        <form
          onSubmit={handleAddRelation}
          className="ds-card"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <h4 style={{ margin: "0 0 12px 0", fontSize: "0.95rem" }}>Adicionar Nova Relação</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" }}>
            <div className="ds-field">
              <label htmlFor="relation-type-select">Tipo de Relação</label>
              <select
                id="relation-type-select"
                className="ds-input"
                value={relationType}
                onChange={(e) => setRelationType(e.target.value as PbiRelationType)}
                disabled={submitting}
              >
                <option value="depende_de">Depende de (bloqueia ciclos)</option>
                <option value="similar_a">Similar a (correlacionado)</option>
                <option value="substitui">Substitui (deprecia/sucede)</option>
              </select>
            </div>

            <div className="ds-field">
              <label htmlFor="relation-target-select">PBI Relacionado</label>
              <select
                id="relation-target-select"
                className="ds-input"
                value={targetPbiId}
                onChange={(e) => setTargetPbiId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Selecione o PBI de destino...</option>
                {candidates.map((cand) => (
                  <option key={cand.id} value={cand.id}>
                    {cand.codigo ? `[${cand.codigo}] ` : ""}{cand.titulo}
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !targetPbiId}
              style={{ height: "42px" }}
            >
              {submitting ? "Adicionando..." : "Adicionar relação"}
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted" role="status">Carregando relações…</p>
      ) : relations.length === 0 ? (
        <EmptyState
          title="Nenhuma relação registrada"
          description={
            canEdit && !readOnly
              ? "Relacione este PBI com outros itens para indicar dependências ou itens similares."
              : "Este PBI não possui relações com outros itens do backlog."
          }
        />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
          {relations.map((rel) => (
            <li
              key={rel.id}
              className="ds-card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                background: "rgba(255, 255, 255, 0.02)",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", flex: 1 }}>
                <Badge tone={getBadgeTone(rel.tipo_relacao)}>
                  {rel.rotulo}
                </Badge>

                <div>
                  <span style={{ fontWeight: 600, marginRight: "6px" }}>
                    {rel.codigo || "PBI"}:
                  </span>
                  <span>{rel.titulo}</span>
                  {rel.status && (
                    <span className="muted" style={{ marginLeft: "8px", fontSize: "0.85rem" }}>
                      ({rel.status})
                    </span>
                  )}
                </div>
              </div>

              {canEdit && !readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deletingId === rel.id}
                  onClick={() => handleDeleteRelation(rel.id)}
                  aria-label={`Remover relação com ${rel.codigo || rel.titulo}`}
                  style={{ color: "#f87171" }}
                >
                  {deletingId === rel.id ? "Removendo..." : "Remover"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
