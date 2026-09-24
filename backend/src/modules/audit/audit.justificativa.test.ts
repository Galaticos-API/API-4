import test from "node:test";
import assert from "node:assert/strict";
import { EpicsService } from "../epics/epics.service.js";
import { FeaturesService } from "../features/features.service.js";
import { PbisService } from "../pbis/pbis.service.js";
import { ValidationError } from "../../shared/errors.js";
import { PbiQualityConfigurationRecord } from "../quality/quality.types.js";

const PROJETO_ID = "d0000000-0000-4000-8000-000000000001";
const EPICO_ID = "a0000000-0000-4000-8000-000000000001";
const FEATURE_ID = "f0000000-0000-4000-8000-000000000001";
const PBI_ID = "b0000000-0000-4000-8000-000000000001";

class StubQualityConfigRepo {
  public config: PbiQualityConfigurationRecord = {
    rule_version: "pbi-quality-v1",
    checks: {
      titulo_infinitivo: true,
      historia_completa: true,
      cenario_estruturado: true,
      termos_vagos: true,
      prototipo_vinculado: true,
    },
    vague_terms: ["adequado"],
    exigir_justificativa_item_concluido: true,
    updated_at: new Date().toISOString(),
    updated_by: null,
  };

  async getPbiConfiguration() {
    return this.config;
  }
}

class StubProjectsRepo {
  async findById(id: string) {
    if (id === PROJETO_ID) {
      return { id: PROJETO_ID, status: "ativo" } as any;
    }
    return null;
  }
}

class StubEpicsRepo {
  public epic: any = {
    id: EPICO_ID,
    projeto_id: PROJETO_ID,
    titulo: "Título Épico",
    descricao: "Descrição",
    objetivo: "Objetivo",
    escopo_macro: "Escopo",
    resultado_esperado: "Resultado",
    status: "rascunho",
    projeto_status: "ativo",
  };

  async findById(id: string) {
    if (id === EPICO_ID) return this.epic;
    return null;
  }

  async update(id: string, data: any) {
    this.epic = { ...this.epic, ...data };
    return this.epic;
  }
}

class StubFeaturesRepo {
  public feature: any = {
    id: FEATURE_ID,
    epico_id: EPICO_ID,
    projeto_id: PROJETO_ID,
    titulo: "Título Feature",
    descricao: "Descrição",
    objetivo: "Objetivo",
    status: "rascunho",
    projeto_status: "ativo",
  };

  async findById(id: string) {
    if (id === FEATURE_ID) return this.feature;
    return null;
  }

  async update(id: string, data: any) {
    this.feature = { ...this.feature, ...data };
    return this.feature;
  }
}

class StubPbisRepo {
  public pbi: any = {
    id: PBI_ID,
    feature_id: FEATURE_ID,
    projeto_id: PROJETO_ID,
    titulo: "Cadastrar item",
    historia_como_um: "PO",
    historia_eu_quero: "Cadastrar",
    historia_para_que: "Manter",
    status: "rascunho",
    projeto_status: "ativo",
  };

  async findById(id: string) {
    if (id === PBI_ID) return this.pbi;
    return null;
  }

  async update(id: string, data: any) {
    this.pbi = { ...this.pbi, ...data };
    return this.pbi;
  }
}

class StubQualityService {
  async validatePbi() {
    return { score_completude: 100 } as any;
  }
}

test("S1-24: Rascunhos salvam sem exigir justificativa", async () => {
  const qualityConfigRepo = new StubQualityConfigRepo();
  const projectsRepo = new StubProjectsRepo();
  const epicsRepo = new StubEpicsRepo();
  const featuresRepo = new StubFeaturesRepo();
  const pbisRepo = new StubPbisRepo();
  const qualityService = new StubQualityService();

  const epicsService = new EpicsService(epicsRepo as any, projectsRepo as any, qualityConfigRepo as any);
  const featuresService = new FeaturesService(featuresRepo as any, epicsRepo as any, qualityConfigRepo as any);
  const pbisService = new PbisService(pbisRepo as any, featuresRepo as any, qualityService as any, qualityConfigRepo as any);

  // Status is rascunho
  epicsRepo.epic.status = "rascunho";
  featuresRepo.feature.status = "rascunho";
  pbisRepo.pbi.status = "rascunho";

  // Updating without justification should succeed for rascunhos
  const epicUpdated = await epicsService.update(EPICO_ID, { titulo: "Título Épico Alterado" });
  assert.equal(epicUpdated.titulo, "Título Épico Alterado");

  const featureUpdated = await featuresService.update(FEATURE_ID, { titulo: "Título Feature Alterado" });
  assert.equal(featureUpdated.titulo, "Título Feature Alterado");

  const pbiUpdated = await pbisService.update(PBI_ID, { titulo: "Cadastrar novo item" });
  assert.equal(pbiUpdated.titulo, "Cadastrar novo item");
});

test("S1-24: Política ativa bloqueia alteração de item concluído sem justificativa", async () => {
  const qualityConfigRepo = new StubQualityConfigRepo();
  qualityConfigRepo.config.exigir_justificativa_item_concluido = true;

  const projectsRepo = new StubProjectsRepo();
  const epicsRepo = new StubEpicsRepo();
  const featuresRepo = new StubFeaturesRepo();
  const pbisRepo = new StubPbisRepo();
  const qualityService = new StubQualityService();

  const epicsService = new EpicsService(epicsRepo as any, projectsRepo as any, qualityConfigRepo as any);
  const featuresService = new FeaturesService(featuresRepo as any, epicsRepo as any, qualityConfigRepo as any);
  const pbisService = new PbisService(pbisRepo as any, featuresRepo as any, qualityService as any, qualityConfigRepo as any);

  // Set status to concluido
  epicsRepo.epic.status = "concluido";
  featuresRepo.feature.status = "concluido";
  pbisRepo.pbi.status = "concluido";

  // Attempting to update without justification must throw ValidationError
  await assert.rejects(
    () => epicsService.update(EPICO_ID, { titulo: "Novo Épico Concluído" }),
    (err: any) => err instanceof ValidationError && err.message.includes("justificativa é obrigatória"),
  );

  await assert.rejects(
    () => featuresService.update(FEATURE_ID, { titulo: "Nova Feature Concluída" }),
    (err: any) => err instanceof ValidationError && err.message.includes("justificativa é obrigatória"),
  );

  await assert.rejects(
    () => pbisService.update(PBI_ID, { titulo: "Consultar item cadastrado" }),
    (err: any) => err instanceof ValidationError && err.message.includes("justificativa é obrigatória"),
  );
});

test("S1-24: Permitir salvar alteração de item concluído quando justificativa é fornecida", async () => {
  const qualityConfigRepo = new StubQualityConfigRepo();
  qualityConfigRepo.config.exigir_justificativa_item_concluido = true;

  const projectsRepo = new StubProjectsRepo();
  const epicsRepo = new StubEpicsRepo();
  const featuresRepo = new StubFeaturesRepo();
  const pbisRepo = new StubPbisRepo();
  const qualityService = new StubQualityService();

  const epicsService = new EpicsService(epicsRepo as any, projectsRepo as any, qualityConfigRepo as any);
  const featuresService = new FeaturesService(featuresRepo as any, epicsRepo as any, qualityConfigRepo as any);
  const pbisService = new PbisService(pbisRepo as any, featuresRepo as any, qualityService as any, qualityConfigRepo as any);

  epicsRepo.epic.status = "concluido";
  featuresRepo.feature.status = "concluido";
  pbisRepo.pbi.status = "concluido";

  // Updating WITH justification must succeed
  const epicUpdated = await epicsService.update(EPICO_ID, { titulo: "Épico Reajustado", justificativa: "Ajuste solicitado pelo cliente" });
  assert.equal(epicUpdated.titulo, "Épico Reajustado");

  const featureUpdated = await featuresService.update(FEATURE_ID, { titulo: "Feature Reajustada", justificativa: "Mudança no escopo de integração" });
  assert.equal(featureUpdated.titulo, "Feature Reajustada");

  const pbiUpdated = await pbisService.update(PBI_ID, { titulo: "Alterar item concluído", justificativa: "Correção ortográfica" });
  assert.equal(pbiUpdated.titulo, "Alterar item concluído");
});

test("S1-24: Política desativada permite salvar item concluído sem justificativa", async () => {
  const qualityConfigRepo = new StubQualityConfigRepo();
  qualityConfigRepo.config.exigir_justificativa_item_concluido = false;

  const projectsRepo = new StubProjectsRepo();
  const epicsRepo = new StubEpicsRepo();
  const featuresRepo = new StubFeaturesRepo();
  const pbisRepo = new StubPbisRepo();
  const qualityService = new StubQualityService();

  const epicsService = new EpicsService(epicsRepo as any, projectsRepo as any, qualityConfigRepo as any);
  const featuresService = new FeaturesService(featuresRepo as any, epicsRepo as any, qualityConfigRepo as any);
  const pbisService = new PbisService(pbisRepo as any, featuresRepo as any, qualityService as any, qualityConfigRepo as any);

  epicsRepo.epic.status = "concluido";
  featuresRepo.feature.status = "concluido";
  pbisRepo.pbi.status = "concluido";

  // When policy is disabled, saving without justification passes
  const epicUpdated = await epicsService.update(EPICO_ID, { titulo: "Épico Sem Justificativa Obrigatória" });
  assert.equal(epicUpdated.titulo, "Épico Sem Justificativa Obrigatória");
});
