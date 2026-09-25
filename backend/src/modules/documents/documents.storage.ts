import { access, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAGING_SUFFIX = ".removing";
const UPLOAD_SUFFIX = ".uploading";

export interface DocumentStorage {
  save(key: string, content: Buffer): Promise<void>;
  finalizeUpload(key: string): Promise<void>;
  remove(key: string): Promise<void>;
  stageRemoval(key: string): Promise<boolean>;
  restore(key: string): Promise<void>;
  discard(key: string): Promise<void>;
  reconcileStaged(documentExists: (key: string) => Promise<boolean>, graceMs?: number): Promise<void>;
}

function isMissing(error: unknown): boolean {
  return (error as { code?: string }).code === "ENOENT";
}

export class LocalDocumentStorage implements DocumentStorage {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  private pathOf(key: string): string {
    if (!STORAGE_KEY.test(key)) throw new Error("Identificador de armazenamento inválido.");
    return join(this.baseDir, key);
  }

  async save(key: string, content: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    try {
      await access(path);
      const duplicate = new Error("Arquivo já existe.") as NodeJS.ErrnoException;
      duplicate.code = "EEXIST";
      throw duplicate;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await writeFile(`${path}${UPLOAD_SUFFIX}`, content, { flag: "wx", mode: 0o600 });
  }

  async finalizeUpload(key: string): Promise<void> {
    const path = this.pathOf(key);
    try {
      await rename(`${path}${UPLOAD_SUFFIX}`, path);
    } catch (error) {
      if (!isMissing(error)) throw error;
      // A retry after a crash between the rename and marking the operation done
      // is successful when the final file is already present.
      await access(path);
    }
  }

  async remove(key: string): Promise<void> {
    const path = this.pathOf(key);
    await Promise.all([
      rm(path, { force: true }),
      rm(`${path}${UPLOAD_SUFFIX}`, { force: true }),
    ]);
  }

  async stageRemoval(key: string): Promise<boolean> {
    const path = this.pathOf(key);
    try {
      await rename(path, `${path}${STAGING_SUFFIX}`);
      return true;
    } catch (error) {
      if (isMissing(error)) {
        try {
          await access(`${path}${STAGING_SUFFIX}`);
          return true;
        } catch (stagedError) {
          if (isMissing(stagedError)) return false;
          throw stagedError;
        }
      }
      throw error;
    }
  }

  async restore(key: string): Promise<void> {
    const path = this.pathOf(key);
    try {
      await rename(`${path}${STAGING_SUFFIX}`, path);
    } catch (error) {
      if (!isMissing(error)) throw error;
      await access(path);
    }
  }

  async discard(key: string): Promise<void> {
    await rm(`${this.pathOf(key)}${STAGING_SUFFIX}`, { force: true });
  }

  async reconcileStaged(documentExists: (key: string) => Promise<boolean>, graceMs = 5 * 60_000): Promise<void> {
    let projects;
    try {
      projects = await readdir(this.baseDir, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }

    for (const project of projects) {
      if (!project.isDirectory() || !/^[0-9a-f-]{36}$/.test(project.name)) continue;
      const directory = join(this.baseDir, project.name);
      const files = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const file of files) {
        if (!file.isFile()) continue;
        const suffix = file.name.endsWith(UPLOAD_SUFFIX)
          ? UPLOAD_SUFFIX
          : file.name.endsWith(STAGING_SUFFIX)
            ? STAGING_SUFFIX
            : null;
        if (!suffix) continue;
        const name = file.name.slice(0, -suffix.length);
        if (!/^[0-9a-f-]{36}$/.test(name)) continue;
        const key = `${project.name}/${name}`;
        const filePath = join(directory, file.name);
        const fileInfo = await stat(filePath).catch(() => null);
        if (!fileInfo || Date.now() - fileInfo.mtimeMs < graceMs) continue;

        try {
          if (await documentExists(key)) {
            if (suffix === UPLOAD_SUFFIX) await this.finalizeUpload(key);
            else await this.restore(key);
          } else if (suffix === UPLOAD_SUFFIX) {
            await rm(filePath, { force: true });
          } else {
            await this.discard(key);
          }
        } catch {
          // Keep unresolved files for the next reconciliation pass.
        }
      }
    }
  }
}
