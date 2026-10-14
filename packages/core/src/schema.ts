/**
 * Zod schemas for the structural check of an export. They are loose: unknown
 * fields pass through, and only the shape GTM's importer relies on is enforced.
 * Cross-entity rules (references, uniqueness) live in validate.ts.
 */
import { z } from 'zod';
import type { Parameter } from './types.js';

const idString = z.string().regex(/^\d+$/, 'IDs must be numeric strings');

export const parameterSchema: z.ZodType<Parameter> = z.lazy(() =>
  z.looseObject({
    type: z.string(),
    key: z.string().optional(),
    value: z.string().optional(),
    list: z.array(parameterSchema).optional(),
    map: z.array(parameterSchema).optional(),
  }),
) as z.ZodType<Parameter>;

const conditionSchema = z.looseObject({
  type: z.string(),
  parameter: z.array(parameterSchema).optional(),
});

const entityBase = {
  accountId: z.string().optional(),
  containerId: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  notes: z.string().optional(),
  fingerprint: z.string().optional(),
  parentFolderId: idString.optional(),
};

const setupTeardown = z.looseObject({ tagName: z.string().min(1) });

export const tagSchema = z.looseObject({
  ...entityBase,
  tagId: idString,
  type: z.string().min(1),
  parameter: z.array(parameterSchema).optional(),
  firingTriggerId: z.array(idString).optional(),
  blockingTriggerId: z.array(idString).optional(),
  setupTag: z.array(setupTeardown).optional(),
  teardownTag: z.array(setupTeardown).optional(),
  tagFiringOption: z.string().optional(),
  priority: parameterSchema.optional(),
  paused: z.boolean().optional(),
  monitoringMetadata: parameterSchema.optional(),
});

export const triggerSchema = z.looseObject({
  ...entityBase,
  triggerId: idString,
  type: z.string().min(1),
  parameter: z.array(parameterSchema).optional(),
  filter: z.array(conditionSchema).optional(),
  autoEventFilter: z.array(conditionSchema).optional(),
  customEventFilter: z.array(conditionSchema).optional(),
});

export const variableSchema = z.looseObject({
  ...entityBase,
  variableId: idString,
  type: z.string().min(1),
  parameter: z.array(parameterSchema).optional(),
  formatValue: z.record(z.string(), z.unknown()).optional(),
});

export const folderSchema = z.looseObject({ ...entityBase, folderId: idString });

export const builtInVariableSchema = z.looseObject({
  accountId: z.string().optional(),
  containerId: z.string().optional(),
  type: z.string().min(1),
  name: z.string().min(1),
});

export const customTemplateSchema = z.looseObject({
  ...entityBase,
  templateId: idString,
  templateData: z.string().min(1),
});

const genericEntity = z.looseObject({ name: z.string().optional() });

export const containerVersionSchema = z.looseObject({
  path: z.string().optional(),
  accountId: z.string().optional(),
  containerId: z.string().optional(),
  containerVersionId: z.string().optional(),
  container: z.looseObject({
    publicId: z.string().optional(),
    usageContext: z.array(z.string()).optional(),
  }),
  tag: z.array(tagSchema).optional(),
  trigger: z.array(triggerSchema).optional(),
  variable: z.array(variableSchema).optional(),
  folder: z.array(folderSchema).optional(),
  builtInVariable: z.array(builtInVariableSchema).optional(),
  customTemplate: z.array(customTemplateSchema).optional(),
  client: z.array(genericEntity).optional(),
  transformation: z.array(genericEntity).optional(),
  zone: z.array(genericEntity).optional(),
});

export const containerExportSchema = z.looseObject({
  exportFormatVersion: z.literal(2, { message: 'only exportFormatVersion 2 is supported' }),
  exportTime: z.string().optional(),
  containerVersion: containerVersionSchema,
});
