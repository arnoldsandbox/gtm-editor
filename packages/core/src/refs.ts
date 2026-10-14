/**
 * Outgoing references of each entity, read straight from the export.
 *
 * GTM links entities in several ways: trigger IDs on tags and in trigger
 * groups, tag *names* for setup/teardown sequencing, variable *names* inside
 * `{{...}}` in any string, `cvt_<containerId>_<templateId>` types for custom
 * templates, and parentFolderId.
 */
import type { CustomTemplate, Folder, Parameter, Tag, Trigger, Variable } from './types.js';

export type Reference =
  | { to: 'trigger'; id: string; via: 'firing' | 'blocking' | 'group'; path: string }
  | { to: 'tag'; name: string; via: 'setup' | 'teardown' | 'tagReference'; path: string }
  | { to: 'variable'; name: string; path: string }
  | { to: 'customTemplate'; containerId: string; templateId: string; path: string }
  | { to: 'folder'; id: string; path: string };

export const VARIABLE_REF = /\{\{([^{}]+?)\}\}/g;

/** Fields that describe the entity itself rather than its behavior. */
const SKIP_FOR_VARIABLE_SCAN = new Set([
  'accountId',
  'containerId',
  'name',
  'notes',
  'fingerprint',
  'parentFolderId',
  'tagId',
  'triggerId',
  'variableId',
  'folderId',
  'templateId',
  'templateData',
  'tagManagerUrl',
  'path',
]);

const CVT_TYPE = /^cvt_(\d+)_(\d+)$/;

export function parseTemplateType(type: string): { containerId: string; templateId: string } | undefined {
  const m = CVT_TYPE.exec(type);
  return m ? { containerId: m[1]!, templateId: m[2]! } : undefined;
}

/** All `{{Name}}` references inside a string. */
export function variableNamesIn(text: string): string[] {
  return [...text.matchAll(VARIABLE_REF)].map((m) => m[1]!);
}

function scanVariables(value: unknown, path: string, out: Reference[], top = true): void {
  if (typeof value === 'string') {
    for (const name of variableNamesIn(value)) out.push({ to: 'variable', name, path });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanVariables(v, `${path}[${i}]`, out, false));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (top && SKIP_FOR_VARIABLE_SCAN.has(k)) continue;
      scanVariables(v, path ? `${path}.${k}` : k, out, false);
    }
  }
}

function scanParameterRefs(params: Parameter[] | undefined, path: string, out: Reference[]): void {
  params?.forEach((p, i) => {
    const here = `${path}[${i}]`;
    if (p.type === 'TRIGGER_REFERENCE' && p.value) out.push({ to: 'trigger', id: p.value, via: 'group', path: here });
    if (p.type === 'TAG_REFERENCE' && p.value) out.push({ to: 'tag', name: p.value, via: 'tagReference', path: here });
    scanParameterRefs(p.list, `${here}.list`, out);
    scanParameterRefs(p.map, `${here}.map`, out);
  });
}

function common(entity: Tag | Trigger | Variable | Folder | CustomTemplate, out: Reference[]): void {
  if (entity.parentFolderId) out.push({ to: 'folder', id: entity.parentFolderId, path: 'parentFolderId' });
  const params = (entity as { parameter?: Parameter[] }).parameter;
  scanParameterRefs(params, 'parameter', out);
  const type = (entity as { type?: string }).type;
  const tpl = type ? parseTemplateType(type) : undefined;
  if (tpl) out.push({ to: 'customTemplate', ...tpl, path: 'type' });
  scanVariables(entity, '', out);
}

export function tagReferences(tag: Tag): Reference[] {
  const out: Reference[] = [];
  tag.firingTriggerId?.forEach((id, i) => out.push({ to: 'trigger', id, via: 'firing', path: `firingTriggerId[${i}]` }));
  tag.blockingTriggerId?.forEach((id, i) =>
    out.push({ to: 'trigger', id, via: 'blocking', path: `blockingTriggerId[${i}]` }),
  );
  tag.setupTag?.forEach((s, i) => out.push({ to: 'tag', name: s.tagName, via: 'setup', path: `setupTag[${i}]` }));
  tag.teardownTag?.forEach((s, i) =>
    out.push({ to: 'tag', name: s.tagName, via: 'teardown', path: `teardownTag[${i}]` }),
  );
  common(tag, out);
  return out;
}

export function triggerReferences(trigger: Trigger): Reference[] {
  const out: Reference[] = [];
  common(trigger, out);
  return out;
}

export function variableReferences(variable: Variable): Reference[] {
  const out: Reference[] = [];
  common(variable, out);
  return out;
}

export function folderReferences(_folder: Folder): Reference[] {
  return [];
}

export function templateReferences(template: CustomTemplate): Reference[] {
  const out: Reference[] = [];
  if (template.parentFolderId) out.push({ to: 'folder', id: template.parentFolderId, path: 'parentFolderId' });
  return out;
}
