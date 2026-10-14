/**
 * An indexed view over a container export: lookups by ID and name, each
 * entity's outgoing references resolved to targets, and the reverse
 * ("used by") graph. The index never copies entities; it points into the
 * export it was built from, so rebuild it after editing.
 */
import { BUILT_IN_TRIGGERS, RESERVED_VARIABLE_NAMES } from './builtins.js';
import {
  folderReferences,
  tagReferences,
  templateReferences,
  triggerReferences,
  variableReferences,
  type Reference,
} from './refs.js';
import type {
  BuiltInVariable,
  ContainerExport,
  CustomTemplate,
  EntityKind,
  EntityRef,
  Folder,
  Tag,
  Trigger,
  Variable,
} from './types.js';
import { ID_FIELD } from './types.js';

export type Entity = Tag | Trigger | Variable | Folder | CustomTemplate;

export type ResolvedTarget =
  | { status: 'entity'; ref: EntityRef }
  | { status: 'builtInTrigger'; name: string }
  | { status: 'builtInVariable'; type: string }
  | { status: 'reserved' }
  | { status: 'missing' };

export interface ResolvedReference {
  reference: Reference;
  target: ResolvedTarget;
}

const KINDS: readonly EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];

export const refKey = (r: EntityRef) => `${r.kind}:${r.id}`;

export class ContainerIndex {
  readonly byId = new Map<EntityKind, Map<string, Entity>>();
  readonly byName = new Map<EntityKind, Map<string, Entity>>();
  readonly builtInsByName = new Map<string, BuiltInVariable>();
  private readonly outgoing = new Map<string, ResolvedReference[]>();
  private readonly incoming = new Map<string, Array<{ from: EntityRef; reference: Reference }>>();

  constructor(readonly exported: ContainerExport) {
    const cv = exported.containerVersion;
    for (const kind of KINDS) {
      const ids = new Map<string, Entity>();
      const names = new Map<string, Entity>();
      for (const e of (cv[kind] ?? []) as Entity[]) {
        // First one wins on duplicates; validate.ts reports them.
        const id = idOf(kind, e);
        if (!ids.has(id)) ids.set(id, e);
        if (!names.has(e.name)) names.set(e.name, e);
      }
      this.byId.set(kind, ids);
      this.byName.set(kind, names);
    }
    for (const b of cv.builtInVariable ?? []) this.builtInsByName.set(b.name, b);

    for (const kind of KINDS) {
      for (const e of this.all(kind)) {
        const from: EntityRef = { kind, id: idOf(kind, e) };
        const resolved = referencesOf(kind, e).map((reference) => ({ reference, target: this.resolve(reference) }));
        this.outgoing.set(refKey(from), resolved);
        for (const r of resolved) {
          if (r.target.status !== 'entity') continue;
          const k = refKey(r.target.ref);
          const list = this.incoming.get(k) ?? [];
          list.push({ from, reference: r.reference });
          this.incoming.set(k, list);
        }
      }
    }
  }

  get containerId(): string | undefined {
    return this.exported.containerVersion.containerId;
  }

  all<K extends EntityKind>(kind: K): Entity[] {
    return (this.exported.containerVersion[kind] ?? []) as Entity[];
  }

  get(ref: EntityRef): Entity | undefined {
    return this.byId.get(ref.kind)?.get(ref.id);
  }

  findByName(kind: EntityKind, name: string): Entity | undefined {
    return this.byName.get(kind)?.get(name);
  }

  /** Outgoing references of an entity, each resolved to what it points at. */
  references(ref: EntityRef): ResolvedReference[] {
    return this.outgoing.get(refKey(ref)) ?? [];
  }

  /** Entities that reference the given one. */
  usedBy(ref: EntityRef): Array<{ from: EntityRef; reference: Reference }> {
    return this.incoming.get(refKey(ref)) ?? [];
  }

  resolve(reference: Reference): ResolvedTarget {
    switch (reference.to) {
      case 'trigger':
        if (this.byId.get('trigger')!.has(reference.id)) return { status: 'entity', ref: { kind: 'trigger', id: reference.id } };
        if (BUILT_IN_TRIGGERS[reference.id]) return { status: 'builtInTrigger', name: BUILT_IN_TRIGGERS[reference.id]! };
        return { status: 'missing' };
      case 'tag': {
        const t = this.findByName('tag', reference.name);
        return t ? { status: 'entity', ref: { kind: 'tag', id: idOf('tag', t) } } : { status: 'missing' };
      }
      case 'variable': {
        const v = this.findByName('variable', reference.name);
        if (v) return { status: 'entity', ref: { kind: 'variable', id: idOf('variable', v) } };
        const b = this.builtInsByName.get(reference.name);
        if (b) return { status: 'builtInVariable', type: b.type };
        if (RESERVED_VARIABLE_NAMES.has(reference.name)) return { status: 'reserved' };
        return { status: 'missing' };
      }
      case 'customTemplate':
        return this.byId.get('customTemplate')!.has(reference.templateId)
          ? { status: 'entity', ref: { kind: 'customTemplate', id: reference.templateId } }
          : { status: 'missing' };
      case 'folder':
        return this.byId.get('folder')!.has(reference.id)
          ? { status: 'entity', ref: { kind: 'folder', id: reference.id } }
          : { status: 'missing' };
    }
  }
}

export function idOf(kind: EntityKind, entity: Entity): string {
  return (entity as unknown as Record<string, string>)[ID_FIELD[kind]]!;
}

export function referencesOf(kind: EntityKind, entity: Entity): Reference[] {
  switch (kind) {
    case 'tag':
      return tagReferences(entity as Tag);
    case 'trigger':
      return triggerReferences(entity as Trigger);
    case 'variable':
      return variableReferences(entity as Variable);
    case 'folder':
      return folderReferences(entity as Folder);
    case 'customTemplate':
      return templateReferences(entity as CustomTemplate);
  }
}
