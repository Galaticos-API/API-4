export interface ArchiveImpact { projeto: number; epicos: number; features: number; pbis: number }

export class ArchiveConflict extends Error {
  constructor(message: string) { super(message); }
}
