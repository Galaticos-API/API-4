import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function createEvaluationOutput(path) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await mkdir(path);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('A pasta de resultados já existe. Use outro --output para preservar a execução anterior.');
    throw error;
  }
}

export async function cleanupEvaluation(steps) {
  const failures = [];
  for (const step of steps) {
    try { await step(); } catch (error) { failures.push(error); }
  }
  return failures;
}
