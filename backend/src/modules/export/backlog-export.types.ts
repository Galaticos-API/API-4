// S3-15 / PBI-01.5.5: árvore que alimenta a exportação em Markdown.
// "numero" é a posição do item entre os irmãos (created_at, id), contando também os
// arquivados, para que o código exportado (EP-01, FT-01.2, PBI-01.2.3) não mude quando
// um irmão for arquivado.

export interface ExportScenario {
  ordem: number;
  nome: string | null;
  dado: string | null;
  quando: string | null;
  entao: string | null;
}

export interface ExportTextCriterion {
  ordem: number;
  texto: string | null;
}

export interface ExportPbi {
  id: string;
  feature_id: string;
  numero: number;
  titulo: string;
  prioridade: string | null;
  status: string;
  historia_como_um: string | null;
  historia_eu_quero: string | null;
  historia_para_que: string | null;
  regras_observacoes: string | null;
  cenarios: ExportScenario[];
}

export interface ExportFeature {
  id: string;
  epico_id: string;
  numero: number;
  titulo: string;
  descricao: string | null;
  objetivo: string | null;
  prioridade: string | null;
  status: string;
  criterios: ExportTextCriterion[];
  pbis: ExportPbi[];
}

export interface ExportEpicRef {
  id: string;
  numero: number;
  titulo: string;
  status: string;
}

export interface ExportEpic extends ExportEpicRef {
  descricao: string | null;
  objetivo: string | null;
  escopo_macro: string | null;
  resultado_esperado: string | null;
  prioridade: string | null;
  criterios: ExportTextCriterion[];
  features: ExportFeature[];
}

export interface MarkdownDocument {
  filename: string;
  content: string;
}
