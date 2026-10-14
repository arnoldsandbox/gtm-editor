import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseContainer, type ContainerExport } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const privateDir = join(here, '../../../fixtures/private');

export function readSample(): { text: string; exported: ContainerExport } {
  const text = readFileSync(join(here, 'fixtures/sample-web.json'), 'utf8');
  return { text, exported: JSON.parse(text) as ContainerExport };
}

/** Real exports dropped into fixtures/private (git-ignored). Empty in CI. */
export const privateFixtures: Array<{ name: string; text: string }> = existsSync(privateDir)
  ? readdirSync(privateDir)
      .filter((f) => f.endsWith('.json'))
      .map((name) => ({ name, text: readFileSync(join(privateDir, name), 'utf8') }))
  : [];

export function load(text: string): ContainerExport {
  const r = parseContainer(text);
  if (!r.ok) throw new Error(r.error);
  return r.exported;
}
