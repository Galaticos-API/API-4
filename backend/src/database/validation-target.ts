export function assertValidationDatabase(database: unknown): void {
  if (typeof database !== 'string' || !/^[a-zA-Z0-9_-]+_s1_validation$/.test(database)) {
    throw new Error('Use um banco descartável terminado em _s1_validation');
  }
}
