import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError, NotFoundError, ValidationError, validateUuid } from "../../shared/errors.js";
import { ArchiveConflict } from "../projects/archive.types.js";
import { ProjectsRepository } from "../projects/projects.repository.js";
import { DocumentsRepository } from "./documents.repository.js";
import { HttpDocumentEventPublisher, type DocumentEventPublisher } from "./documents.events.js";
import { LocalDocumentStorage, type DocumentStorage } from "./documents.storage.js";
import { ALLOWED_EXTENSIONS, inspectDocument } from "./documents.validation.js";
import type { DocumentLimits, DocumentList, DocumentRecord, RemovalResult } from "./documents.types.js";

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
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function decodeCursor(value: string | undefined): { createdAt: string; id: string } | null {
  if (!value) return null;
  if (value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new ValidationError("Cursor de documentos inválido.");
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null || !("created_at" in parsed) || !("id" in parsed)) {
      throw new Error("invalid cursor");
    }
    const candidate = parsed as { created_at: unknown; id: unknown };
    if (typeof candidate.created_at !== "string" || !Number.isFinite(Date.parse(candidate.created_at)) || typeof candidate.id !== "string") {
      throw new Error("invalid cursor");
    }
    validateUuid(candidate.id, "Cursor de documentos");
    return { createdAt: candidate.created_at, id: candidate.id };
  } catch {
    throw new ValidationError("Cursor de documentos inválido.");
  }
}

function encodeCursor(record: DocumentRecord): string {
  return Buffer.from(JSON.stringify({ created_at: record.created_at, id: record.id })).toString("base64url");
}

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

  async list(projetoId: string, cursorValue?: string, pageSizeValue?: string): Promise<DocumentList> {
    await this.requireProject(projetoId);
    const pageSize = pageSizeValue === undefined ? DEFAULT_PAGE_SIZE : Number(pageSizeValue);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
      throw new ValidationError(`O limite de documentos deve ser um inteiro entre 1 e ${MAX_PAGE_SIZE}.`);
    }
    const page = await this.repository.listByProject(projetoId, decodeCursor(cursorValue), pageSize);
    const last = page.items.at(-1);
    return {
      items: page.items,
      next_cursor: page.hasMore && last ? encodeCursor(last) : null,
      limites: this.limits,
      paginacao: { tamanho_pagina: pageSize, tamanho_maximo: MAX_PAGE_SIZE },
    };
  }

  async upload(input: UploadDocumentInput): Promise<DocumentRecord> {
    const project = await this.requireProject(input.projetoId);
    if (project.status === "arquivado") {
      throw new ArchiveConflict("Projeto arquivado é somente leitura e não recebe novos documentos.");
    }
    const inspected = inspectDocument(input.fileName, input.content, this.maxBytes);
    const id = randomUUID();
    const caminho = `${input.projetoId}/${id}`;
    try {
      await this.storage.save(caminho, input.content);
    } catch {
      throw new AppError("Não foi possível armazenar o arquivo agora. Sua seleção foi mantida; tente novamente.", 503, "STORAGE_UNAVAILABLE");
    }
    let created: DocumentRecord;
    try {
      created = await this.repository.create({
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
      try {
        await this.storage.remove(caminho);
      } catch {
        throw new AppError("O envio não foi registrado. Um arquivo temporário ficou pendente de limpeza; tente novamente mais tarde.", 503, "STORAGE_RECOVERY_PENDING");
      }
      throw error;
    }

    try {
      await this.storage.finalizeUpload(caminho);
      await this.repository.completeUploadOperation(id);
      created.armazenamento_pendente = false;
    } catch {
      await this.repository.markStorageOperationFailedForDocument(id, "finalizar_upload").catch(() => undefined);
      // The durable operation remains queued; the caller gets an explicit state
      // and the background worker retries without creating duplicate metadata.
      created.armazenamento_pendente = true;
    }
    return created;
  }

  async remove(command: RemoveDocumentCommand): Promise<void> {
    const project = await this.requireProject(command.projetoId);
    if (project.status === "arquivado") {
      throw new ArchiveConflict("Projeto arquivado é somente leitura e não permite remover documentos.");
    }
    validateUuid(command.documentoId, "ID do documento");
    const stored = await this.repository.findById(command.projetoId, command.documentoId);
    if (!stored) return;
    let staged = false;
    try {
      staged = await this.storage.stageRemoval(stored.caminho);
    } catch {
      throw new AppError("Não foi possível remover o arquivo agora. O documento continua disponível; tente novamente.", 503, "STORAGE_UNAVAILABLE");
    }
    let result: RemovalResult | null;
    try {
      result = await this.repository.remove({ id: stored.id, projetoId: command.projetoId, usuarioId: command.usuarioId });
    } catch (error) {
      if (staged) {
        try {
          await this.storage.restore(stored.caminho);
        } catch {
          if (error instanceof ArchiveConflict) {
            throw new ArchiveConflict(`${error.message} O arquivo está sendo recuperado e será restaurado automaticamente.`);
          }
          throw new AppError("A remoção foi revertida, mas o arquivo está em recuperação automática.", 503, "STORAGE_RECOVERY_PENDING");
        }
      }
      if (error instanceof ArchiveConflict) throw error;
      throw new AppError("Não foi possível remover o documento. Ele continua disponível; tente novamente.", 500, "REMOVAL_FAILED");
    }

    if (!result) {
      if (staged) await this.storage.discard(stored.caminho).catch(() => undefined);
      return;
    }
    try {
      await this.storage.discard(stored.caminho);
      await this.repository.completeStorageOperation(result.storageOperationId);
    } catch {
      await this.repository.markStorageOperationFailed(result.storageOperationId).catch(() => undefined);
    }
  }

  async flushPendingEvents(): Promise<void> {
    const pending = await this.repository.listPendingEvents(PENDING_EVENTS_BATCH);
    for (const item of pending) {
      const published = await this.events.publish(item.payload);
      if (published) await this.repository.markEventPublished(item.chave_idempotencia);
      else await this.repository.markEventFailed(item.chave_idempotencia);
    }
  }

  async processPendingStorageOperations(): Promise<void> {
    const pending = await this.repository.listPendingStorageOperations(PENDING_EVENTS_BATCH);
    for (const operation of pending) {
      try {
        if (operation.acao === "finalizar_upload") await this.storage.finalizeUpload(operation.caminho);
        else await this.storage.discard(operation.caminho);
        await this.repository.completeStorageOperation(operation.id);
      } catch {
        await this.repository.markStorageOperationFailed(operation.id);
      }
    }
  }

  async reconcileStagedFiles(): Promise<void> {
    await this.storage.reconcileStaged((key) => this.repository.documentExists(key));
  }

  async runBackgroundMaintenance(): Promise<void> {
    await Promise.all([this.flushPendingEvents(), this.processPendingStorageOperations()]);
    await this.reconcileStagedFiles();
  }
}

export const documentsService = new DocumentsService();

export function startDocumentsBackgroundWorker(service: DocumentsService = documentsService): () => void {
  let running = false;
  let lastReconcile = 0;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await Promise.all([service.flushPendingEvents(), service.processPendingStorageOperations()]);
      if (Date.now() - lastReconcile >= 5 * 60_000) {
        await service.reconcileStagedFiles();
        lastReconcile = Date.now();
      }
    } catch {
      // The leased rows and staged files remain recoverable for the next pass.
      console.warn("[Documents] Background maintenance pass failed; work remains queued.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 15_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
