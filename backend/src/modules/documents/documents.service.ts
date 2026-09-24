import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { DocumentsRepository } from "./documents.repository.js";
import { HttpDocumentEventPublisher, type DocumentEventPublisher } from "./documents.events.js";
import { LocalDocumentStorage, type DocumentStorage } from "./documents.storage.js";
import { ALLOWED_EXTENSIONS, inspectDocument } from "./documents.validation.js";
import type { DocumentLimits, DocumentList, DocumentRecord } from "./documents.types.js";

export interface ProjectLookup {
  findById(id: string): Promise<{ id: string; status: string } | null>;
}

export interface UploadDocumentInput {
  projetoId: string;
  usuarioId: string;
  fileName: string;
  content: Buffer;
}

export interface RemoveDocumentCommand {
  projetoId: string;
  documentoId: string;
  usuarioId: string;
}

const PENDING_EVENTS_BATCH = 20;

export class DocumentsService {
  constructor(
    private readonly repository: DocumentsRepository = new DocumentsRepository(),
    private readonly storage: DocumentStorage = new LocalDocumentStorage(env.DOCUMENT_STORAGE_DIR),
    private readonly events: DocumentEventPublisher = new HttpDocumentEventPublisher(),
    private readonly projects: ProjectLookup = new ProjectsRepository(),
    private readonly maxBytes: number = Math.floor(env.DOCUMENT_MAX_SIZE_MB * 1024 * 1024),
  ) {}

  get limits(): DocumentLimits {
    return { max_bytes: this.maxBytes, extensoes_permitidas: [...ALLOWED_EXTENSIONS] };
  }

  private async requireProject(projetoId: string): Promise<{ id: string; status: string }> {
    validateUuid(projetoId, "ID do projeto");
    const project = await this.projects.findById(projetoId);
    if (!project) throw new NotFoundError("Projeto não encontrado.");
    return project;
  }

  async list(projetoId: string): Promise<DocumentList> {
    await this.requireProject(projetoId);
    return { items: await this.repository.listByProject(projetoId), limites: this.limits };
  }

  async upload(input: UploadDocumentInput): Promise<DocumentRecord> {
    const project = await this.requireProject(input.projetoId);
    if (project.status === "arquivado") {
      throw new ValidationError("Projeto arquivado é somente leitura e não recebe novos documentos.");
    }
    const inspected = inspectDocument(input.fileName, input.content, this.maxBytes);
    const id = randomUUID();
    const caminho = `${input.projetoId}/${id}`;
    try {
      await this.storage.save(caminho, input.content);
    } catch {
      throw new AppError("Não foi possível armazenar o arquivo agora. Sua seleção foi mantida; tente novamente.", 503, "STORAGE_UNAVAILABLE");
    }
    try {
      return await this.repository.create({
        id,
        projetoId: input.projetoId,
        nome: inspected.nome,
        extensao: inspected.extensao,
        mime: inspected.mime,
        tamanhoBytes: input.content.length,
        caminho,
        usuarioId: input.usuarioId,
      });
    } catch (error) {
      await this.storage.remove(caminho).catch(() => undefined);
      throw error;
    }
  }

  async remove(command: RemoveDocumentCommand): Promise<void> {
    await this.requireProject(command.projetoId);
    validateUuid(command.documentoId, "ID do documento");
    const stored = await this.repository.findById(command.projetoId, command.documentoId);
    if (!stored) {
      await this.flushPendingEvents();
      return;
    }
    let staged = false;
    try {
      staged = await this.storage.stageRemoval(stored.caminho);
    } catch {
      throw new AppError("Não foi possível remover o arquivo agora. O documento continua disponível; tente novamente.", 503, "STORAGE_UNAVAILABLE");
    }
    try {
      await this.repository.remove({ id: stored.id, projetoId: command.projetoId, usuarioId: command.usuarioId });
    } catch {
      if (staged) await this.storage.restore(stored.caminho).catch(() => undefined);
      throw new AppError("Não foi possível remover o documento. Ele continua disponível; tente novamente.", 500, "REMOVAL_FAILED");
    }
    if (staged) await this.storage.discard(stored.caminho).catch(() => undefined);
    await this.flushPendingEvents();
  }

  async flushPendingEvents(): Promise<void> {
    try {
      const pending = await this.repository.listPendingEvents(PENDING_EVENTS_BATCH);
      for (const item of pending) {
        const published = await this.events.publish(item.payload);
        if (published) await this.repository.markEventPublished(item.chave_idempotencia);
        else await this.repository.markEventFailed(item.chave_idempotencia);
      }
    } catch {
      return;
    }
  }
}

export const documentsService = new DocumentsService();
