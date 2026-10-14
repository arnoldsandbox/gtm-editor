/**
 * Automatic repairs for the issues validate.ts marks `fixable`.
 */
import { formatExportTime, WEB_BUILT_IN_VARIABLES } from './builtins.js';
import { ContainerIndex, idOf, type Entity } from './model.js';
import type { BuiltInVariable, ContainerExport, EntityKind } from './types.js';

export interface FixResult {
  exported: ContainerExport;
  applied: string[];
}

const KINDS: readonly EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];

export function autoFix(input: ContainerExport, now: Date = new Date()): FixResult {
  const exported = structuredClone(input);
  const cv = exported.containerVersion;
  const applied: string[] = [];

  if (exported.exportTime && !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(exported.exportTime)) {
    const parsed = new Date(exported.exportTime);
    exported.exportTime = formatExportTime(Number.isNaN(parsed.getTime()) ? now : parsed);
    applied.push(`Reformatted exportTime to ${exported.exportTime}`);
  }

  for (const kind of KINDS) {
    for (const e of (cv[kind] ?? []) as Entity[]) {
      if ((cv.accountId && e.accountId && e.accountId !== cv.accountId) ||
          (cv.containerId && e.containerId && e.containerId !== cv.containerId)) {
        e.accountId = cv.accountId;
        e.containerId = cv.containerId;
        applied.push(`Moved ${kind} "${e.name}" onto this container's account/container IDs`);
      }
    }
  }

  const index = new ContainerIndex(exported);
  const toEnable = new Set<string>();
  for (const kind of KINDS) {
    for (const e of index.all(kind)) {
      for (const { reference, target } of index.references({ kind, id: idOf(kind, e) })) {
        if (target.status !== 'missing') continue;
        if (reference.to === 'variable' && WEB_BUILT_IN_VARIABLES[reference.name]) toEnable.add(reference.name);
        if (reference.to === 'folder') {
          delete e.parentFolderId;
          applied.push(`Removed missing folder ${reference.id} from ${kind} "${e.name}"`);
        }
      }
    }
  }
  if (toEnable.size) {
    cv.builtInVariable ??= [];
    for (const name of [...toEnable].sort()) {
      const b: BuiltInVariable = { accountId: cv.accountId, containerId: cv.containerId, type: WEB_BUILT_IN_VARIABLES[name]!, name };
      cv.builtInVariable.push(b);
      applied.push(`Enabled built-in variable {{${name}}}`);
    }
  }

  return { exported, applied };
}
