/**
 * Types for the GTM container export format (exportFormatVersion 2).
 *
 * Every object keeps unknown fields: GTM adds fields over time, and a file
 * that is loaded and saved without edits must come back unchanged.
 */

export type ParameterType =
  | 'TEMPLATE'
  | 'BOOLEAN'
  | 'INTEGER'
  | 'LIST'
  | 'MAP'
  | 'TAG_REFERENCE'
  | 'TRIGGER_REFERENCE'
  | (string & {});

export interface Parameter {
  type: ParameterType;
  key?: string;
  value?: string;
  list?: Parameter[];
  map?: Parameter[];
  isWeakReference?: boolean;
  [extra: string]: unknown;
}

export interface Condition {
  type: string;
  parameter?: Parameter[];
  [extra: string]: unknown;
}

interface EntityBase {
  accountId?: string;
  containerId?: string;
  name: string;
  notes?: string;
  fingerprint?: string;
  parentFolderId?: string;
  [extra: string]: unknown;
}

export interface SetupTeardownRef {
  tagName: string;
  stopOnSetupFailure?: boolean;
  stopTeardownOnFailure?: boolean;
  [extra: string]: unknown;
}

export interface Tag extends EntityBase {
  tagId: string;
  type: string;
  parameter?: Parameter[];
  firingTriggerId?: string[];
  blockingTriggerId?: string[];
  setupTag?: SetupTeardownRef[];
  teardownTag?: SetupTeardownRef[];
  tagFiringOption?: string;
  priority?: Parameter;
  paused?: boolean;
  consentSettings?: { consentStatus: string; consentType?: Parameter; [extra: string]: unknown };
  monitoringMetadata?: Parameter;
}

export interface Trigger extends EntityBase {
  triggerId: string;
  type: string;
  parameter?: Parameter[];
  filter?: Condition[];
  autoEventFilter?: Condition[];
  customEventFilter?: Condition[];
}

export interface Variable extends EntityBase {
  variableId: string;
  type: string;
  parameter?: Parameter[];
  formatValue?: Record<string, unknown>;
}

export interface Folder extends EntityBase {
  folderId: string;
}

export interface BuiltInVariable {
  accountId?: string;
  containerId?: string;
  type: string;
  name: string;
  [extra: string]: unknown;
}

export interface CustomTemplate extends EntityBase {
  templateId: string;
  templateData: string;
  galleryReference?: Record<string, unknown>;
}

/** Server-container and zone entities. Passed through untouched for now. */
export interface GenericEntity extends EntityBase {
  [extra: string]: unknown;
}

export interface ContainerInfo {
  path?: string;
  accountId?: string;
  containerId?: string;
  name?: string;
  publicId?: string;
  usageContext?: string[];
  fingerprint?: string;
  tagManagerUrl?: string;
  features?: Record<string, boolean>;
  tagIds?: string[];
  [extra: string]: unknown;
}

export interface ContainerVersion {
  path?: string;
  accountId?: string;
  containerId?: string;
  containerVersionId?: string;
  name?: string;
  description?: string;
  container: ContainerInfo;
  tag?: Tag[];
  trigger?: Trigger[];
  variable?: Variable[];
  folder?: Folder[];
  builtInVariable?: BuiltInVariable[];
  customTemplate?: CustomTemplate[];
  client?: GenericEntity[];
  transformation?: GenericEntity[];
  zone?: GenericEntity[];
  fingerprint?: string;
  tagManagerUrl?: string;
  [extra: string]: unknown;
}

export interface ContainerExport {
  exportFormatVersion: number;
  exportTime?: string;
  containerVersion: ContainerVersion;
  [extra: string]: unknown;
}

/** The entity kinds that carry their own ID and can be selected, edited or extracted. */
export type EntityKind = 'tag' | 'trigger' | 'variable' | 'folder' | 'customTemplate';

export const ID_FIELD = {
  tag: 'tagId',
  trigger: 'triggerId',
  variable: 'variableId',
  folder: 'folderId',
  customTemplate: 'templateId',
} as const satisfies Record<EntityKind, string>;

export interface EntityRef {
  kind: EntityKind;
  id: string;
}
