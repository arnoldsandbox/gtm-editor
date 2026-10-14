/**
 * Import-validity checks. An export with any `error` issue is one GTM's
 * importer would reject or import broken; `warning` issues import but are
 * probably not what the author meant.
 */
import { WEB_BUILT_IN_VARIABLES } from './builtins.js';
import { ContainerIndex, idOf, type Entity } from './model.js';
import { parseTemplateType } from './refs.js';
import { containerExportSchema } from './schema.js';
import type { ContainerExport, EntityKind, EntityRef } from './types.js';

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'schema'
  | 'duplicate-id'
  | 'duplicate-name'
  | 'missing-trigger'
  | 'missing-tag'
  | 'missing-variable'
  | 'builtin-not-enabled'
  | 'missing-template'
  | 'missing-folder'
  | 'self-reference'
  | 'template-container-mismatch'
  | 'foreign-ids'
  | 'export-time-format'
  | 'no-firing-trigger';

export interface Issue {
  severity: Severity;
  code: IssueCode;
  message: string;
  /** JSON path inside the export, e.g. `containerVersion.tag[3].firingTriggerId[0]`. */
  path?: string;
  entity?: EntityRef;
  /** Set when fix.ts can repair this issue automatically. */
  fixable?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  issues: Issue[];
}

const KINDS: readonly EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];
const NATIVE_EXPORT_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

export function validate(input: unknown): ValidationResult {
  const issues: Issue[] = [];
  const parsed = containerExportSchema.safeParse(input);
  if (!parsed.success) {
    for (const zi of parsed.error.issues) {
      issues.push({ severity: 'error', code: 'schema', message: zi.message, path: formatPath(zi.path) });
    }
    return { valid: false, issues };
  }

  const exported = input as ContainerExport;
  const cv = exported.containerVersion;
  const index = new ContainerIndex(exported);

  if (exported.exportTime && !NATIVE_EXPORT_TIME.test(exported.exportTime)) {
    issues.push({
      severity: 'warning',
      code: 'export-time-format',
      message: `exportTime "${exported.exportTime}" is not in GTM's native "YYYY-MM-DD HH:MM:SS" format`,
      path: 'exportTime',
      fixable: true,
    });
  }

  for (const kind of KINDS) {
    const list = (cv[kind] ?? []) as Entity[];
    const seenIds = new Map<string, number>();
    const seenNames = new Map<string, number>();
    list.forEach((e, i) => {
      const id = idOf(kind, e);
      const path = `containerVersion.${kind}[${i}]`;
      const entity = { kind, id };
      if (seenIds.has(id)) {
        issues.push({ severity: 'error', code: 'duplicate-id', message: `Duplicate ${kind} ID ${id}`, path, entity });
      }
      seenIds.set(id, i);
      if (seenNames.has(e.name)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-name',
          message: `Duplicate ${kind} name "${e.name}"`,
          path,
          entity,
        });
      }
      seenNames.set(e.name, i);

      if (
        (e.accountId && cv.accountId && e.accountId !== cv.accountId) ||
        (e.containerId && cv.containerId && e.containerId !== cv.containerId)
      ) {
        issues.push({
          severity: 'warning',
          code: 'foreign-ids',
          message: `${kind} "${e.name}" carries account/container IDs from another container`,
          path,
          entity,
          fixable: true,
        });
      }

      for (const { reference, target } of index.references(entity)) {
        const rpath = reference.path ? `${path}.${reference.path}` : path;
        if (target.status === 'entity' && target.ref.kind === kind && target.ref.id === id && reference.to !== 'folder') {
          issues.push({
            severity: 'error',
            code: 'self-reference',
            message: `${kind} "${e.name}" references itself`,
            path: rpath,
            entity,
          });
        }
        if (target.status !== 'missing') continue;
        issues.push(missingIssue(reference, rpath, entity, e.name));
      }

      if (kind === 'tag') {
        const t = e as { firingTriggerId?: string[]; type: string };
        const isSequenced = index.usedBy(entity).some((u) => u.reference.to === 'tag');
        if (!t.firingTriggerId?.length && !isSequenced) {
          issues.push({
            severity: 'warning',
            code: 'no-firing-trigger',
            message: `Tag "${e.name}" has no firing trigger and is not used as a setup/teardown tag, so it never fires`,
            path,
            entity,
          });
        }
        const tpl = parseTemplateType(t.type);
        if (tpl && cv.containerId && tpl.containerId !== cv.containerId) {
          issues.push({
            severity: 'error',
            code: 'template-container-mismatch',
            message: `Tag "${e.name}" type ${t.type} points at container ${tpl.containerId}, not ${cv.containerId}`,
            path: `${path}.type`,
            entity,
          });
        }
      }
    });
  }

  return { valid: !issues.some((i) => i.severity === 'error'), issues };
}

function missingIssue(
  reference: Parameters<ContainerIndex['resolve']>[0],
  path: string,
  entity: EntityRef,
  name: string,
): Issue {
  switch (reference.to) {
    case 'trigger':
      return {
        severity: 'error',
        code: 'missing-trigger',
        message: `"${name}" references trigger ID ${reference.id}, which is not in the container`,
        path,
        entity,
      };
    case 'tag':
      return {
        severity: 'error',
        code: 'missing-tag',
        message: `"${name}" references tag "${reference.name}" (${reference.via}), which is not in the container`,
        path,
        entity,
      };
    case 'variable':
      if (WEB_BUILT_IN_VARIABLES[reference.name]) {
        return {
          severity: 'error',
          code: 'builtin-not-enabled',
          message: `"${name}" uses built-in variable {{${reference.name}}}, which is not enabled`,
          path,
          entity,
          fixable: true,
        };
      }
      return {
        severity: 'error',
        code: 'missing-variable',
        message: `"${name}" references {{${reference.name}}}, which is not a variable in the container`,
        path,
        entity,
      };
    case 'customTemplate':
      return {
        severity: 'error',
        code: 'missing-template',
        message: `"${name}" uses custom template ${reference.templateId}, which is not in the container`,
        path,
        entity,
      };
    case 'folder':
      return {
        severity: 'error',
        code: 'missing-folder',
        message: `"${name}" is in folder ${reference.id}, which is not in the container`,
        path,
        entity,
        fixable: true,
      };
  }
}

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>(
    (acc, p) => (typeof p === 'number' ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)),
    '',
  );
}
