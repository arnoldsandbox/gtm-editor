import type { ContainerExport } from './types.js';
import { validate, type ValidationResult } from './validate.js';

export type ParseResult =
  | { ok: true; exported: ContainerExport; validation: ValidationResult }
  | { ok: false; error: string; validation?: ValidationResult };

/**
 * Parse the text of a GTM export. `ok` means the JSON has the export's
 * structure and can be loaded; check `validation.valid` before treating it
 * as importable.
 */
export function parseContainer(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  const validation = validate(data);
  if (validation.issues.some((i) => i.code === 'schema')) {
    return { ok: false, error: 'Not a GTM container export (exportFormatVersion 2)', validation };
  }
  return { ok: true, exported: data as ContainerExport, validation };
}
