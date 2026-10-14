import { describe, expect, test } from 'vitest';
import { autoFix, parseContainer, serialize, validate, type ContainerExport } from '../src/index.js';
import { load, privateFixtures, readSample } from './helpers.js';

const codes = (e: unknown) => validate(e).issues.map((i) => `${i.severity}:${i.code}`);

describe('sample container', () => {
  test('parses, validates clean and round-trips byte for byte', () => {
    const { text } = readSample();
    const r = parseContainer(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validation.issues).toEqual([]);
    expect(serialize(r.exported)).toBe(text);
  });

  test('rejects text that is not JSON or not an export', () => {
    expect(parseContainer('{nope').ok).toBe(false);
    expect(parseContainer('{"exportFormatVersion": 1, "containerVersion": {"container": {}}}').ok).toBe(false);
  });

  test('numeric IDs are a schema error', () => {
    const { exported } = readSample();
    (exported.containerVersion.tag![0] as unknown as { tagId: number }).tagId = 1;
    expect(codes(exported)).toContain('error:schema');
  });
});

describe('reference checks', () => {
  const broken = (mutate: (e: ContainerExport) => void) => {
    const { exported } = readSample();
    mutate(exported);
    return codes(exported);
  };

  test('missing firing trigger', () => {
    expect(broken((e) => (e.containerVersion.tag![1]!.firingTriggerId = ['99']))).toContain('error:missing-trigger');
  });

  test('missing trigger-group member', () => {
    expect(broken((e) => e.containerVersion.trigger!.splice(1, 1))).toContain('error:missing-trigger');
  });

  test('missing setup tag (linked by name)', () => {
    expect(broken((e) => (e.containerVersion.tag![0]!.name = 'Renamed'))).toContain('error:missing-tag');
  });

  test('missing nested variable', () => {
    expect(broken((e) => (e.containerVersion.variable![3]!.name = 'Const - Gone'))).toContain('error:missing-variable');
  });

  test('built-in variable not enabled, and autoFix enables it', () => {
    const { exported } = readSample();
    exported.containerVersion.builtInVariable = exported.containerVersion.builtInVariable!.filter(
      (b) => b.name !== 'Page Path',
    );
    const issues = validate(exported).issues;
    expect(issues.map((i) => i.code)).toContain('builtin-not-enabled');
    const fixed = autoFix(exported);
    expect(fixed.applied).toContain('Enabled built-in variable {{Page Path}}');
    expect(validate(fixed.exported).valid).toBe(true);
  });

  test('missing custom template', () => {
    expect(broken((e) => (e.containerVersion.customTemplate = []))).toContain('error:missing-template');
  });

  test('duplicate names and IDs', () => {
    const result = broken((e) => {
      const v = e.containerVersion.variable!;
      v.push({ ...v[0]!, variableId: '50' });
      v.push({ ...v[1]!, name: 'Fresh name' });
    });
    expect(result).toContain('error:duplicate-name');
    expect(result).toContain('error:duplicate-id');
  });

  test('{{_event}} and built-in trigger IDs are valid without entries', () => {
    expect(validate(readSample().exported).valid).toBe(true);
  });

  test('autoFix normalizes ISO exportTime', () => {
    const { exported } = readSample();
    exported.exportTime = '2026-10-13T20:31:00.000Z';
    expect(codes(exported)).toContain('warning:export-time-format');
    expect(autoFix(exported).exported.exportTime).toBe('2026-10-13 20:31:00');
  });
});

describe.skipIf(privateFixtures.length === 0)('real exports in fixtures/private', () => {
  test.each(privateFixtures)('$name has no errors and round-trips', ({ text }) => {
    const r = parseContainer(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.validation.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(serialize(load(text))).toBe(text);
  });
});
