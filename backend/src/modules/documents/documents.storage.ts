import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const STORAGE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STAGING_SUFFIX = ".removing";

export interface DocumentStorage {
  save(key: string, content: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
  stageRemoval(key: string): Promise<boolean>;
  restore(key: string): Promise<void>;
  discard(key: string): Promise<void>;
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
    await writeFile(path, content, { flag: "wx", mode: 0o600 });
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  async stageRemoval(key: string): Promise<boolean> {
    const path = this.pathOf(key);
    try {
      await rename(path, `${path}${STAGING_SUFFIX}`);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async restore(key: string): Promise<void> {
    const path = this.pathOf(key);
    await rename(`${path}${STAGING_SUFFIX}`, path);
  }

  async discard(key: string): Promise<void> {
    await rm(`${this.pathOf(key)}${STAGING_SUFFIX}`, { force: true });
  }
}
