/**
 * Copy entities from one container export into another.
 *
 * Incoming entities get fresh IDs in the base container, every reference
 * between them is rewritten (trigger IDs, folder IDs, setup/teardown tag
 * names, `{{variable}}` names, `cvt_` template types), and name clashes are
 * settled by the chosen policy. Folders with the same name are always merged.
 */
import { formatExportTime } from './builtins.js';
import { dependencyClosure } from './extract.js';
import { ContainerIndex, idOf, refKey, type Entity } from './model.js';
import { parseTemplateType, VARIABLE_REF } from './refs.js';
import type { ContainerExport, EntityKind, EntityRef, Parameter, Tag } from './types.js';
import { ID_FIELD } from './types.js';

export type ConflictPolicy =
  /** Keep both; the incoming entity is renamed "Name (2)". */
  | 'rename'
  /** Keep the base entity; incoming references point at it instead. */
  | 'keepBase'
  /** Overwrite the base entity's content with the incoming one, keeping its ID. */
  | 'replace';

export interface CombineOptions {
  /** Entities of `incoming` to copy, plus their dependencies. Default: everything. */
  selection?: EntityRef[];
  onConflict?: ConflictPolicy;
  now?: Date;
}

export interface CombineReport {
  added: Array<EntityRef & { name: string }>;
  renamed: Array<{ kind: EntityKind; from: string; to: string }>;
  replaced: Array<EntityRef & { name: string }>;
  keptBase: Array<EntityRef & { name: string }>;
  builtInsEnabled: string[];
}

// Order matters: folders and templates first so later entities can be remapped onto them.
const KINDS: readonly EntityKind[] = ['folder', 'customTemplate', 'variable', 'trigger', 'tag'];

const SKIP_KEYS = new Set(['accountId', 'containerId', 'name', 'notes', 'fingerprint', 'templateData']);

export function combine(
  base: ContainerExport,
  incoming: ContainerExport,
  options: CombineOptions = {},
): { exported: ContainerExport; report: CombineReport } {
  const policy = options.onConflict ?? 'rename';
  const out = structuredClone(base);
  const cv = out.containerVersion;
  const baseIndex = new ContainerIndex(out);
  const inIndex = new ContainerIndex(incoming);

  const selection =
    options.selection ??
    KINDS.flatMap((kind) => inIndex.all(kind).map((e) => ({ kind, id: idOf(kind, e) })));
  const { entities: wanted, builtIns } = dependencyClosure(inIndex, selection);

  const report: CombineReport = { added: [], renamed: [], replaced: [], keptBase: [], builtInsEnabled: [] };
  const idMap = new Map<string, string>(); // "kind:oldId" -> new ID in base
  const nameMap = new Map<string, string>(); // "kind:oldName" -> name in base
  const nextId = new Map<EntityKind, number>();
  for (const kind of KINDS) {
    const ids = baseIndex.all(kind).map((e) => Number(idOf(kind, e)));
    nextId.set(kind, Math.max(0, ...ids) + 1);
  }
  const allocate = (kind: EntityKind) => {
    const n = nextId.get(kind)!;
    nextId.set(kind, n + 1);
    return String(n);
  };
  const takenNames = new Map<EntityKind, Set<string>>(
    KINDS.map((k) => [k, new Set(baseIndex.all(k).map((e) => e.name))]),
  );

  // Pass 1: decide each incoming entity's ID and name in the base container.
  type Plan = { kind: EntityKind; source: Entity; id: string; name: string; replaces?: Entity; skip: boolean };
  const plans: Plan[] = [];
  for (const kind of KINDS) {
    for (const source of inIndex.all(kind)) {
      const oldId = idOf(kind, source);
      if (!wanted.has(refKey({ kind, id: oldId }))) continue;
      const clash = baseIndex.findByName(kind, source.name);
      const effective: ConflictPolicy = kind === 'folder' ? 'keepBase' : policy;
      let plan: Plan;
      if (clash && effective === 'keepBase') {
        plan = { kind, source, id: idOf(kind, clash), name: clash.name, skip: true };
        report.keptBase.push({ kind, id: plan.id, name: plan.name });
      } else if (clash && effective === 'replace') {
        plan = { kind, source, id: idOf(kind, clash), name: clash.name, replaces: clash, skip: false };
        report.replaced.push({ kind, id: plan.id, name: plan.name });
      } else {
        let name = source.name;
        if (clash) {
          for (let n = 2; takenNames.get(kind)!.has(name); n++) name = `${source.name} (${n})`;
          report.renamed.push({ kind, from: source.name, to: name });
        }
        takenNames.get(kind)!.add(name);
        plan = { kind, source, id: allocate(kind), name, skip: false };
        report.added.push({ kind, id: plan.id, name });
      }
      idMap.set(`${kind}:${oldId}`, plan.id);
      nameMap.set(`${kind}:${source.name}`, plan.name);
      plans.push(plan);
    }
  }

  // Pass 2: rewrite and insert.
  const ctx: RewriteContext = {
    idMap,
    nameMap,
    incomingContainerId: incoming.containerVersion.containerId,
    baseContainerId: cv.containerId,
    baseAccountId: cv.accountId,
  };
  for (const plan of plans) {
    if (plan.skip) continue;
    const entity = rewrite(plan.kind, structuredClone(plan.source), plan.id, plan.name, ctx);
    const list = ((cv as Record<string, unknown>)[plan.kind] ??= []) as Entity[];
    if (plan.replaces) list[list.indexOf(plan.replaces)] = entity;
    else list.push(entity);
  }

  // Built-in variables the copied entities rely on.
  for (const name of [...builtIns].sort()) {
    if (baseIndex.builtInsByName.has(name)) continue;
    const src = inIndex.builtInsByName.get(name)!;
    (cv.builtInVariable ??= []).push({ ...src, accountId: cv.accountId, containerId: cv.containerId });
    report.builtInsEnabled.push(name);
  }

  out.exportTime = formatExportTime(options.now ?? new Date());
  return { exported: out, report };
}

interface RewriteContext {
  idMap: Map<string, string>;
  nameMap: Map<string, string>;
  incomingContainerId?: string;
  baseContainerId?: string;
  baseAccountId?: string;
}

function rewrite(kind: EntityKind, e: Entity, id: string, name: string, ctx: RewriteContext): Entity {
  const rec = e as unknown as Record<string, unknown>;
  rec[ID_FIELD[kind]] = id;
  e.name = name;
  if (ctx.baseAccountId) e.accountId = ctx.baseAccountId;
  if (ctx.baseContainerId) e.containerId = ctx.baseContainerId;
  if (e.parentFolderId) e.parentFolderId = ctx.idMap.get(`folder:${e.parentFolderId}`);
  if (!e.parentFolderId) delete e.parentFolderId;

  const mapTrigger = (t: string) => ctx.idMap.get(`trigger:${t}`) ?? t; // built-in trigger IDs pass through
  const mapTagName = (n: string) => ctx.nameMap.get(`tag:${n}`) ?? n;

  if (kind === 'tag') {
    const tag = e as Tag;
    if (tag.firingTriggerId) tag.firingTriggerId = tag.firingTriggerId.map(mapTrigger);
    if (tag.blockingTriggerId) tag.blockingTriggerId = tag.blockingTriggerId.map(mapTrigger);
    tag.setupTag?.forEach((s) => (s.tagName = mapTagName(s.tagName)));
    tag.teardownTag?.forEach((s) => (s.tagName = mapTagName(s.tagName)));
  }
  const type = rec.type;
  if (typeof type === 'string') {
    const tpl = parseTemplateType(type);
    if (tpl && tpl.containerId === ctx.incomingContainerId) {
      rec.type = `cvt_${ctx.baseContainerId}_${ctx.idMap.get(`customTemplate:${tpl.templateId}`) ?? tpl.templateId}`;
    }
  }
  const walkParams = (params: Parameter[] | undefined) =>
    params?.forEach((p) => {
      if (p.type === 'TRIGGER_REFERENCE' && p.value) p.value = mapTrigger(p.value);
      if (p.type === 'TAG_REFERENCE' && p.value) p.value = mapTagName(p.value);
      walkParams(p.list);
      walkParams(p.map);
    });
  walkParams(rec.parameter as Parameter[] | undefined);

  // `{{Old Name}}` -> `{{New Name}}` for renamed variables, everywhere but descriptive fields.
  for (const [k, v] of Object.entries(rec)) {
    if (!SKIP_KEYS.has(k)) rec[k] = renameVariables(v, ctx.nameMap);
  }
  return e;
}

function renameVariables(value: unknown, nameMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(VARIABLE_REF, (whole, n: string) => {
      const to = nameMap.get(`variable:${n}`);
      return to && to !== n ? `{{${to}}}` : whole;
    });
  }
  if (Array.isArray(value)) return value.map((v) => renameVariables(v, nameMap));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) (value as Record<string, unknown>)[k] = renameVariables(v, nameMap);
  }
  return value;
}
