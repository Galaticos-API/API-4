import { DocumentsRepository, removalEventKey, type PendingEvent } from "./documents.repository.js";
import type { DocumentEventPublisher } from "./documents.events.js";
import type { DocumentStorage } from "./documents.storage.js";
import type {
  CreateDocumentInput,
  DocumentRecord,
  DocumentRemovedEvent,
  DocumentStatus,
  RemovalResult,
  RemoveDocumentInput,
  StoredDocument,
} from "./documents.types.js";

export const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
export const OTHER_PROJECT_ID = "a0000000-0000-4000-8000-000000000002";
export const ARCHIVED_PROJECT_ID = "a0000000-0000-4000-8000-000000000003";
export const USER_ID = "b0000000-0000-4000-8000-000000000001";

export function pdfBuffer(size = 64): Buffer {
  return Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), Buffer.alloc(size, 0x20)]);
}

export function docxBuffer(): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("[Content_Types].xml word/document.xml", "latin1")]);
}

export const projectLookup = {
  async findById(id: string): Promise<{ id: string; status: string } | null> {
    if (id === PROJECT_ID || id === OTHER_PROJECT_ID) return { id, status: "ativo" };
    if (id === ARCHIVED_PROJECT_ID) return { id, status: "arquivado" };
    return null;
  },
};

interface StoredRow extends DocumentRecord {
  caminho: string;
}

export class FakeDocumentsRepository extends DocumentsRepository {
  public rows: StoredRow[] = [];
  public audit: Array<{ acao: string; documentoId: string; dados: Record<string, unknown> }> = [];
  public events = new Map<string, { payload: DocumentRemovedEvent; status: "pendente" | "publicado" | "falha" }>();
  public failCreate = false;
  public failRemove = false;
  public chunks = new Map<string, number>();
  public storageOperations = new Map<string, { id: string; documento_id: string; projeto_id: string; acao: "finalizar_upload" | "descartar_remocao"; caminho: string; status: "pendente" | "concluido" }>();

  constructor() {
    super();
  }

  seed(row: Partial<StoredRow> & { id: string; projeto_id: string; caminho: string; status_processamento?: DocumentStatus }): StoredRow {
    const full: StoredRow = {
      nome: "seed.pdf",
      extensao: ".pdf",
      mime: "application/pdf",
      tamanho_bytes: 10,
      autor_id: USER_ID,
      autor_nome: "Ana PO",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status_processamento: "pendente",
      armazenamento_pendente: false,
      ...row,
    };
    this.rows.push(full);
    return full;
  }

  async listByProject(projetoId: string, cursor: { createdAt: string; id: string } | null, limit: number) {
    const matching = this.rows
      .filter((row) => row.projeto_id === projetoId)
      .filter((row) => !cursor || Date.parse(row.created_at) < Date.parse(cursor.createdAt)
        || (Date.parse(row.created_at) === Date.parse(cursor.createdAt) && row.id < cursor.id))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id));
    const page = matching.slice(0, limit + 1);
    return {
      items: page.slice(0, limit).map(({ caminho: _caminho, ...record }) => record),
      hasMore: page.length > limit,
    };
  }

  async findById(projetoId: string, id: string): Promise<StoredDocument | null> {
    const row = this.rows.find((item) => item.id === id && item.projeto_id === projetoId);
    if (!row) return null;
    return { id: row.id, projeto_id: row.projeto_id, nome: row.nome, caminho: row.caminho, status_processamento: row.status_processamento };
  }

  async create(input: CreateDocumentInput): Promise<DocumentRecord> {
    if (this.failCreate) throw new Error("falha simulada");
    const row = this.seed({
      id: input.id,
      projeto_id: input.projetoId,
      nome: input.nome,
      extensao: input.extensao,
      mime: input.mime,
      tamanho_bytes: input.tamanhoBytes,
      caminho: input.caminho,
      autor_id: input.usuarioId,
      armazenamento_pendente: true,
    });
    const operationId = `upload:${input.id}`;
    this.storageOperations.set(operationId, {
      id: operationId,
      documento_id: input.id,
      projeto_id: input.projetoId,
      acao: "finalizar_upload",
      caminho: input.caminho,
      status: "pendente",
    });
    this.audit.push({ acao: "ENVIAR_DOCUMENTO", documentoId: input.id, dados: { nome: input.nome } });
    const { caminho: _caminho, ...record } = row;
    return record;
  }

  async remove(input: RemoveDocumentInput): Promise<RemovalResult | null> {
    if (this.failRemove) throw new Error("falha simulada");
    const index = this.rows.findIndex((row) => row.id === input.id && row.projeto_id === input.projetoId);
    if (index < 0) return null;
    const [row] = this.rows.splice(index, 1);
    const storageOperationId = `remove:${input.id}`;
    this.storageOperations.set(storageOperationId, {
      id: storageOperationId,
      documento_id: input.id,
      projeto_id: input.projetoId,
      acao: "descartar_remocao",
      caminho: row.caminho,
      status: "pendente",
    });
    const chunksRemovidos = this.chunks.get(row.id) ?? 0;
    const indexado = chunksRemovidos > 0 || row.status_processamento === "processado";
    let eventoChave: string | null = null;
    if (indexado) {
      eventoChave = removalEventKey(row.id);
      if (!this.events.has(eventoChave)) {
        this.events.set(eventoChave, {
          status: "pendente",
          payload: {
            event_id: eventoChave,
            event_type: "document.removed",
            schema_version: 1,
            occurred_at: new Date().toISOString(),
            project_id: row.projeto_id,
            document_id: row.id,
            chunks_removed: chunksRemovidos,
          },
        });
      }
    }
    this.audit.push({ acao: "REMOVER_DOCUMENTO", documentoId: row.id, dados: { indexado } });
    return {
      documento: { id: row.id, projeto_id: row.projeto_id, nome: row.nome, caminho: row.caminho, status_processamento: row.status_processamento },
      indexado,
      chunksRemovidos,
      eventoChave,
      storageOperationId,
    };
  }

  async completeUploadOperation(documentId: string): Promise<void> {
    const row = this.rows.find((item) => item.id === documentId);
    if (row) row.armazenamento_pendente = false;
    const op = this.storageOperations.get(`upload:${documentId}`);
    if (op) op.status = "concluido";
  }

  async completeStorageOperation(id: string): Promise<void> {
    const operation = this.storageOperations.get(id);
    if (operation) {
      operation.status = "concluido";
      if (operation.acao === "finalizar_upload") {
        const row = this.rows.find((item) => item.id === operation.documento_id);
        if (row) row.armazenamento_pendente = false;
      }
    }
  }

  async markStorageOperationFailed(): Promise<void> {}

  async markStorageOperationFailedForDocument(): Promise<void> {}

  async listPendingStorageOperations(limit: number) {
    return [...this.storageOperations.values()].filter((item) => item.status === "pendente").slice(0, limit);
  }

  async documentExists(caminho: string): Promise<boolean> {
    return this.rows.some((row) => row.caminho === caminho);
  }

  async listPendingEvents(limit: number): Promise<PendingEvent[]> {
    return [...this.events.entries()]
      .filter(([, value]) => value.status !== "publicado")
      .slice(0, limit)
      .map(([chave, value]) => ({ chave_idempotencia: chave, payload: value.payload }));
  }

  async markEventPublished(chave: string): Promise<void> {
    const event = this.events.get(chave);
    if (event) event.status = "publicado";
  }

  async markEventFailed(chave: string): Promise<void> {
    const event = this.events.get(chave);
    if (event) event.status = "falha";
  }

  public stats = { eventos_pendentes: 0, evento_mais_antigo_segundos: 0, operacoes_armazenamento_pendentes: 0 };

  async maintenanceStats() {
    return { ...this.stats };
  }
}

export class FakeStorage implements DocumentStorage {
  public files = new Map<string, Buffer>();
  public uploads = new Map<string, Buffer>();
  public staged = new Set<string>();
  public failSave = false;
  public failStage = false;
  public failFinalize = false;

  async save(key: string, content: Buffer): Promise<void> {
    if (this.failSave) throw new Error("disco cheio");
    this.uploads.set(key, content);
  }

  async finalizeUpload(key: string): Promise<void> {
    if (this.failFinalize) throw new Error("falha simulada");
    const content = this.uploads.get(key);
    if (content) {
      this.files.set(key, content);
      this.uploads.delete(key);
    }
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key);
    this.uploads.delete(key);
  }

  async stageRemoval(key: string): Promise<boolean> {
    if (this.failStage) throw new Error("sem permissão");
    if (!this.files.has(key)) return false;
    this.staged.add(key);
    return true;
  }

  async restore(key: string): Promise<void> {
    this.staged.delete(key);
  }

  async discard(key: string): Promise<void> {
    this.staged.delete(key);
    this.files.delete(key);
  }

  async reconcileStaged(): Promise<void> {}
}

export class FakePublisher implements DocumentEventPublisher {
  public published: DocumentRemovedEvent[] = [];
  public available = true;

  async publish(event: DocumentRemovedEvent): Promise<boolean> {
    if (!this.available) return false;
    this.published.push(event);
    return true;
  }
}
