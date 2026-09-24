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
      ...row,
    };
    this.rows.push(full);
    return full;
  }

  async listByProject(projetoId: string): Promise<DocumentRecord[]> {
    return this.rows
      .filter((row) => row.projeto_id === projetoId)
      .map(({ caminho: _caminho, ...record }) => record);
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
    };
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
}

export class FakeStorage implements DocumentStorage {
  public files = new Map<string, Buffer>();
  public staged = new Set<string>();
  public failSave = false;
  public failStage = false;

  async save(key: string, content: Buffer): Promise<void> {
    if (this.failSave) throw new Error("disco cheio");
    this.files.set(key, content);
  }

  async remove(key: string): Promise<void> {
    this.files.delete(key);
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
