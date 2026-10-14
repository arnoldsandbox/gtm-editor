import { describe, expect, test } from 'vitest';
import { combine, ContainerIndex, extract, idOf, validate, type EntityKind } from '../src/index.js';
import { load, privateFixtures, readSample } from './helpers.js';

const names = (list?: Array<{ name: string }>) => (list ?? []).map((e) => e.name).sort();

describe('extract', () => {
  test('pulls in triggers, group members, setup tags, nested variables, built-ins and folders', () => {
    const { exported } = readSample();
    const { exported: out, builtIns } = extract(exported, [{ kind: 'tag', id: '2' }]);
    const cv = out.containerVersion;
    expect(names(cv.tag)).toEqual(['GA4 - Google Tag', 'GA4 Event - generate_lead']);
    expect(names(cv.trigger)).toEqual([
      'Block - internal traffic',
      'CE - cid_ready',
      'CE - form_submit',
      'Group - form_submit + cid_ready',
    ]);
    expect(names(cv.variable)).toEqual(['CJS - Is Internal', 'Const - GA4 ID', 'Const - Internal Hosts', 'DLV - form_id']);
    expect(builtIns).toEqual(['Page Hostname', 'Page Path']);
    expect(names(cv.folder)).toEqual(['GA4']);
    expect(cv.customTemplate).toBeUndefined();
    expect(validate(out).issues).toEqual([]);
  });

  test('brings the custom template a tag is built on', () => {
    const { exported: out } = extract(readSample().exported, [{ kind: 'tag', id: '3' }]);
    expect(names(out.containerVersion.customTemplate)).toEqual(['Consent Default Template']);
    expect(validate(out).valid).toBe(true);
  });

  test('can leave folders out', () => {
    const { exported: out } = extract(readSample().exported, [{ kind: 'tag', id: '2' }], { includeFolders: false });
    expect(out.containerVersion.folder).toBeUndefined();
  });
});

describe('combine', () => {
  test('rename policy copies everything with new IDs and rewired references', () => {
    const { exported } = readSample();
    const { exported: out, report } = combine(exported, exported, { onConflict: 'rename' });
    const cv = out.containerVersion;
    expect(cv.tag).toHaveLength(8);
    expect(cv.folder).toHaveLength(2); // same-name folders merge
    expect(report.renamed).toContainEqual({ kind: 'variable', from: 'Const - GA4 ID', to: 'Const - GA4 ID (2)' });

    const copy = cv.tag!.find((t) => t.name === 'GA4 Event - generate_lead (2)')!;
    expect(copy.setupTag![0]!.tagName).toBe('GA4 - Google Tag (2)');
    expect(JSON.stringify(copy.parameter)).toContain('{{Const - GA4 ID (2)}}');
    expect(JSON.stringify(copy.parameter)).toContain('{{Page Path}}'); // built-ins untouched
    const group = cv.trigger!.find((t) => t.triggerId === copy.firingTriggerId![0])!;
    expect(group.name).toBe('Group - form_submit + cid_ready (2)');
    const consent = cv.tag!.find((t) => t.name === 'Consent - Default (2)')!;
    expect(consent.type).toBe('cvt_222_11');
    expect(validate(out).issues).toEqual([]);
  });

  test('keepBase policy adds nothing when every name already exists', () => {
    const { exported } = readSample();
    const { exported: out, report } = combine(exported, exported, { onConflict: 'keepBase' });
    expect(report.added).toEqual([]);
    expect(out.containerVersion.tag).toHaveLength(4);
  });

  test('selection copies only that tag and its dependencies', () => {
    const { exported } = readSample();
    const empty = structuredClone(exported);
    for (const k of ['tag', 'trigger', 'variable', 'folder', 'customTemplate', 'builtInVariable'] as const) {
      delete empty.containerVersion[k];
    }
    const { exported: out, report } = combine(empty, exported, { selection: [{ kind: 'tag', id: '2' }] });
    expect(names(out.containerVersion.tag)).toEqual(['GA4 - Google Tag', 'GA4 Event - generate_lead']);
    expect(report.builtInsEnabled).toEqual(['Page Hostname', 'Page Path']);
    expect(validate(out).issues).toEqual([]);
  });
});

describe.skipIf(privateFixtures.length === 0)('real exports in fixtures/private', () => {
  test.each(privateFixtures)('$name: every tag extracts to a valid container', ({ text }) => {
    const exported = load(text);
    const index = new ContainerIndex(exported);
    for (const tag of index.all('tag')) {
      const { exported: out } = extract(exported, [{ kind: 'tag', id: idOf('tag', tag) }]);
      const errors = validate(out).issues.filter((i) => i.severity === 'error');
      expect(errors, tag.name).toEqual([]);
    }
  });

  test('every pair of real exports combines into a valid container', () => {
    for (const a of privateFixtures) {
      for (const b of privateFixtures) {
        const { exported: out } = combine(load(a.text), load(b.text));
        const errors = validate(out).issues.filter((i) => i.severity === 'error');
        expect(errors, `${a.name} + ${b.name}`).toEqual([]);
        const kinds: EntityKind[] = ['tag', 'trigger', 'variable'];
        for (const k of kinds) {
          const ids = new ContainerIndex(out).all(k).map((e) => idOf(k, e));
          expect(new Set(ids).size).toBe(ids.length);
        }
      }
    }
  });
});
