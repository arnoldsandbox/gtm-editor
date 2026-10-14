import {
  ID_FIELD,
  idOf,
  type ContainerExport,
  type Entity,
  type EntityKind,
  type EntityRef,
} from '@gtm-editor/core';

export const KINDS: EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];

export const KIND_LABEL: Record<EntityKind, string> = {
  tag: 'Tags',
  trigger: 'Triggers',
  variable: 'Variables',
  folder: 'Folders',
  customTemplate: 'Templates',
};

export const sameRef = (a: EntityRef | null | undefined, b: EntityRef | null | undefined) =>
  !!a && !!b && a.kind === b.kind && a.id === b.id;

/** Replace one entity, returning a new export. The entity keeps its slot in the list. */
export function replaceEntity(exported: ContainerExport, ref: EntityRef, next: Entity): ContainerExport {
  const out = structuredClone(exported);
  const list = (out.containerVersion[ref.kind] ?? []) as Entity[];
  const i = list.findIndex((e) => idOf(ref.kind, e) === ref.id);
  if (i < 0) throw new Error(`No ${ref.kind} ${ref.id}`);
  list[i] = next;
  return out;
}

export function deleteEntities(exported: ContainerExport, refs: EntityRef[]): ContainerExport {
  const out = structuredClone(exported);
  for (const kind of KINDS) {
    const drop = new Set(refs.filter((r) => r.kind === kind).map((r) => r.id));
    if (!drop.size) continue;
    const list = (out.containerVersion[kind] ?? []) as Entity[];
    (out.containerVersion as Record<string, unknown>)[kind] = list.filter((e) => !drop.has(idOf(kind, e)));
  }
  return out;
}

export const idField = (kind: EntityKind) => ID_FIELD[kind];

export function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
