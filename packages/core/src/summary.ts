import type { ContainerExport } from './types.js';

export interface ContainerSummary {
  publicId?: string;
  name?: string;
  usageContext?: string[];
  containerVersionId?: string;
  exportTime?: string;
  counts: Record<'tag' | 'trigger' | 'variable' | 'folder' | 'builtInVariable' | 'customTemplate', number>;
  typeCounts: Record<'tag' | 'trigger' | 'variable', Record<string, number>>;
}

export function summarize(exported: ContainerExport): ContainerSummary {
  const cv = exported.containerVersion;
  const countTypes = (list: Array<{ type: string }> = []) =>
    list.reduce<Record<string, number>>((acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc), {});
  return {
    publicId: cv.container.publicId,
    name: cv.container.name,
    usageContext: cv.container.usageContext,
    containerVersionId: cv.containerVersionId,
    exportTime: exported.exportTime,
    counts: {
      tag: cv.tag?.length ?? 0,
      trigger: cv.trigger?.length ?? 0,
      variable: cv.variable?.length ?? 0,
      folder: cv.folder?.length ?? 0,
      builtInVariable: cv.builtInVariable?.length ?? 0,
      customTemplate: cv.customTemplate?.length ?? 0,
    },
    typeCounts: { tag: countTypes(cv.tag), trigger: countTypes(cv.trigger), variable: countTypes(cv.variable) },
  };
}
