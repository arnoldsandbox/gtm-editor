import type { ContainerExport } from './types.js';

/** Serialize an export the way GTM writes it: 4-space indentation, no trailing newline. */
export function serialize(exported: ContainerExport): string {
  return JSON.stringify(exported, null, 4);
}
