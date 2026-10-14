/**
 * Extract a set of entities into a standalone export that imports cleanly:
 * everything they depend on (triggers, setup/teardown tags, variables used in
 * `{{...}}`, nested variables, custom templates, folders, built-in variables)
 * comes along.
 */
import { formatExportTime } from './builtins.js';
import { ContainerIndex, idOf, refKey, type Entity } from './model.js';
import type { BuiltInVariable, ContainerExport, ContainerVersion, EntityKind, EntityRef } from './types.js';

export interface ExtractOptions {
  /** Keep the folders the extracted entities sit in. Default true. */
  includeFolders?: boolean;
  now?: Date;
}

export interface ExtractResult {
  exported: ContainerExport;
  /** Every entity in the result: the selection plus its dependencies. */
  included: EntityRef[];
  builtIns: string[];
}

const KINDS: readonly EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];

/** The selection plus everything it transitively depends on. */
export function dependencyClosure(
  index: ContainerIndex,
  selection: EntityRef[],
  options: Pick<ExtractOptions, 'includeFolders'> = {},
): { entities: Map<string, EntityRef>; builtIns: Set<string> } {
  const includeFolders = options.includeFolders ?? true;
  const entities = new Map<string, EntityRef>();
  const builtIns = new Set<string>();
  const queue = [...selection];
  while (queue.length) {
    const ref = queue.pop()!;
    if (entities.has(refKey(ref))) continue;
    if (!index.get(ref)) throw new Error(`No ${ref.kind} with ID ${ref.id} in this container`);
    if (ref.kind === 'folder' && !includeFolders && !selection.some((s) => refKey(s) === refKey(ref))) continue;
    entities.set(refKey(ref), ref);
    for (const { reference, target } of index.references(ref)) {
      if (target.status === 'entity') {
        if (target.ref.kind === 'folder' && !includeFolders) continue;
        queue.push(target.ref);
      } else if (target.status === 'builtInVariable' && reference.to === 'variable') {
        builtIns.add(reference.name);
      }
    }
  }
  return { entities, builtIns };
}

export function extract(source: ContainerExport, selection: EntityRef[], options: ExtractOptions = {}): ExtractResult {
  const index = new ContainerIndex(source);
  const { entities, builtIns } = dependencyClosure(index, selection, options);
  const { containerVersion: cv } = source;

  const out: ContainerVersion = {} as ContainerVersion;
  // Rebuild in the source's key order so diffs against the original stay small.
  for (const [key, value] of Object.entries(cv)) {
    if ((KINDS as readonly string[]).includes(key)) {
      const kind = key as EntityKind;
      const kept = ((value as Entity[]) ?? []).filter((e) => entities.has(refKey({ kind, id: idOf(kind, e) })));
      if (kept.length) (out as Record<string, unknown>)[key] = structuredClone(kept);
    } else if (key === 'builtInVariable') {
      const kept = ((value as BuiltInVariable[]) ?? []).filter((b) => builtIns.has(b.name));
      if (kept.length) out.builtInVariable = structuredClone(kept);
    } else {
      (out as Record<string, unknown>)[key] = structuredClone(value);
    }
  }

  const { containerVersion: _omit, ...envelope } = source;
  return {
    exported: {
      ...structuredClone(envelope),
      exportTime: formatExportTime(options.now ?? new Date()),
      containerVersion: out,
    },
    included: [...entities.values()],
    builtIns: [...builtIns].sort(),
  };
}
