import type { BacklogRoute } from "../../models/navigation";
import { navigate } from "../../models/navigation";
import { EpicForm, EpicDetail } from "./EpicsView";
import { FeatureList, FeatureForm, FeatureDetail } from "./FeaturesView";
import { PbiList, PbiForm, PbiDetail } from "./PbisView";

export function BacklogScreen({ route, canCreate }: { route: Exclude<BacklogRoute, null>; canCreate: boolean }) {
  if (route.screen === "epic-new") {
    return canCreate ? <EpicForm projetoId={route.projectId} /> : <SomenteLeitura voltar={`/projects/${route.projectId}`} />;
  }

  if (route.screen === "epic-detail") {
    return (
      <EpicDetail projectId={route.projectId} epicId={route.epicId} canEdit={canCreate}>
        <FeatureList projectId={route.projectId} epicoId={route.epicId} canCreate={canCreate} />
      </EpicDetail>
    );
  }

  if (route.screen === "feature-new") {
    return canCreate
      ? <FeatureForm projectId={route.projectId} epicoId={route.epicId} />
      : <SomenteLeitura voltar={`/projects/${route.projectId}/epics/${route.epicId}`} />;
  }

  if (route.screen === "feature-detail") {
    return (
      <FeatureDetail projectId={route.projectId} epicoId={route.epicId} featureId={route.featureId} canEdit={canCreate}>
        <PbiList projectId={route.projectId} epicoId={route.epicId} featureId={route.featureId} canCreate={canCreate} />
      </FeatureDetail>
    );
  }

  if (route.screen === "pbi-new") {
    return canCreate
      ? <PbiForm projectId={route.projectId} epicoId={route.epicId} featureId={route.featureId} />
      : <SomenteLeitura voltar={`/projects/${route.projectId}/epics/${route.epicId}/features/${route.featureId}`} />;
  }

  return <PbiDetail projectId={route.projectId} epicoId={route.epicId} featureId={route.featureId} pbiId={route.pbiId} canEdit={canCreate} />;
}

function SomenteLeitura({ voltar }: { voltar: string }) {
  return (
    <section className="projects-page">
      <h2>Acesso de leitura</h2>
      <p role="alert">Seu perfil não permite criar itens do backlog.</p>
      <button className="btn-secondary" onClick={() => navigate(voltar)}>Voltar</button>
    </section>
  );
}
