#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { Command, Option } from 'commander';
import {
  autoFix,
  combine,
  ContainerIndex,
  extract,
  idOf,
  parseContainer,
  serialize,
  summarize,
  validate,
  type ConflictPolicy,
  type ContainerExport,
  type EntityKind,
  type EntityRef,
  type Issue,
} from '@gtm-editor/core';

const KINDS: EntityKind[] = ['tag', 'trigger', 'variable', 'folder', 'customTemplate'];

function load(file: string): ContainerExport {
  const r = parseContainer(readFileSync(file, 'utf8'));
  if (!r.ok) {
    console.error(`${file}: ${r.error}`);
    r.validation?.issues.slice(0, 10).forEach((i) => console.error(`  ${i.path ?? ''} ${i.message}`));
    process.exit(2);
  }
  return r.exported;
}

function printIssues(issues: Issue[]): void {
  for (const i of issues) console.log(`${i.severity.padEnd(7)} ${i.code.padEnd(26)} ${i.message}${i.fixable ? ' (fixable)' : ''}`);
}

/** Write a container, refusing to write one GTM would reject. */
function write(exported: ContainerExport, out: string | undefined): void {
  const v = validate(exported);
  const errors = v.issues.filter((i) => i.severity === 'error');
  if (errors.length) {
    console.error('Refusing to write: the result would not import cleanly.');
    printIssues(errors);
    process.exit(1);
  }
  const text = serialize(exported);
  if (out) {
    writeFileSync(out, text);
    console.error(`Wrote ${out}`);
  } else {
    process.stdout.write(text + '\n');
  }
}

/** Resolve --tag/--trigger/... values (IDs or names) to entity refs. */
function selection(index: ContainerIndex, opts: Record<string, string[] | undefined>): EntityRef[] {
  const refs: EntityRef[] = [];
  for (const kind of KINDS) {
    for (const key of opts[kind] ?? []) {
      const entity = index.get({ kind, id: key }) ?? index.findByName(kind, key);
      if (!entity) {
        console.error(`No ${kind} with ID or name "${key}"`);
        process.exit(2);
      }
      refs.push({ kind, id: idOf(kind, entity) });
    }
  }
  return refs;
}

const collect = (v: string, prev: string[] = []) => [...prev, v];
const withSelection = (cmd: Command) =>
  cmd
    .option('--tag <idOrName>', 'tag to include (repeatable)', collect)
    .option('--trigger <idOrName>', 'trigger to include (repeatable)', collect)
    .option('--variable <idOrName>', 'variable to include (repeatable)', collect)
    .option('--folder <idOrName>', 'folder to include (repeatable)', collect)
    .option('--template <idOrName>', 'custom template to include (repeatable)', collect);
const selectionOpts = (o: Record<string, string[] | undefined>) => ({ ...o, customTemplate: o.template });

const program = new Command('gtm-editor').description('Inspect, validate, extract and combine GTM container exports.');

program
  .command('inspect')
  .argument('<file>')
  .description('summarize a container and list any problems')
  .action((file: string) => {
    const exported = load(file);
    const s = summarize(exported);
    console.log(`${s.publicId ?? '?'}  ${s.name ?? ''}  (${(s.usageContext ?? []).join(', ')})  version ${s.containerVersionId}`);
    for (const [k, n] of Object.entries(s.counts)) console.log(`  ${k.padEnd(16)} ${n}`);
    for (const kind of ['tag', 'trigger', 'variable'] as const) {
      const types = Object.entries(s.typeCounts[kind]).map(([t, n]) => `${t} ${n}`);
      if (types.length) console.log(`  ${kind} types: ${types.join(', ')}`);
    }
    const issues = validate(exported).issues;
    console.log(issues.length ? `\n${issues.length} issue(s):` : '\nNo issues.');
    printIssues(issues);
  });

program
  .command('validate')
  .argument('<file>')
  .option('--json', 'print issues as JSON')
  .description('exit 1 if the container would not import cleanly')
  .action((file: string, o: { json?: boolean }) => {
    const v = validate(load(file));
    if (o.json) console.log(JSON.stringify(v, null, 2));
    else {
      printIssues(v.issues);
      console.log(v.valid ? 'Valid.' : 'Not importable.');
    }
    process.exit(v.valid ? 0 : 1);
  });

program
  .command('list')
  .argument('<file>')
  .argument('<kind>', KINDS.join(' | '))
  .option('-s, --search <text>', 'match name, type or any parameter value (case-insensitive)')
  .description('list entities of one kind')
  .action((file: string, kind: EntityKind, o: { search?: string }) => {
    const index = new ContainerIndex(load(file));
    const needle = o.search?.toLowerCase();
    for (const e of index.all(kind)) {
      if (needle && !JSON.stringify(e).toLowerCase().includes(needle)) continue;
      const type = (e as { type?: string }).type ?? '';
      console.log(`${idOf(kind, e).padStart(6)}  ${type.padEnd(16)} ${e.name}`);
    }
  });

program
  .command('show')
  .argument('<file>')
  .argument('<kind>', KINDS.join(' | '))
  .argument('<idOrName>')
  .description('print one entity with what it references and what uses it')
  .action((file: string, kind: EntityKind, key: string) => {
    const index = new ContainerIndex(load(file));
    const entity = index.get({ kind, id: key }) ?? index.findByName(kind, key);
    if (!entity) {
      console.error(`No ${kind} with ID or name "${key}"`);
      process.exit(2);
    }
    const ref = { kind, id: idOf(kind, entity) };
    console.log(JSON.stringify(entity, null, 2));
    console.log('\nReferences:');
    for (const { reference, target } of index.references(ref)) {
      const label = 'id' in reference ? reference.id : 'name' in reference ? reference.name : reference.templateId;
      const to = target.status === 'entity' ? index.get(target.ref)?.name : target.status;
      console.log(`  ${reference.to} ${label} -> ${to}`);
    }
    console.log('\nUsed by:');
    for (const u of index.usedBy(ref)) console.log(`  ${u.from.kind} ${index.get(u.from)?.name}`);
  });

withSelection(program.command('extract'))
  .argument('<file>')
  .option('-o, --out <file>', 'output file (default: stdout)')
  .option('--no-folders', 'leave folders out')
  .description('write the selected entities and everything they depend on as an importable container')
  .action((file: string, o: Record<string, string[] | undefined> & { out?: string; folders: boolean }) => {
    const exported = load(file);
    const refs = selection(new ContainerIndex(exported), selectionOpts(o));
    if (!refs.length) {
      console.error('Select at least one entity with --tag, --trigger, --variable, --folder or --template.');
      process.exit(2);
    }
    const r = extract(exported, refs, { includeFolders: o.folders });
    console.error(`Extracted ${r.included.length} entities${r.builtIns.length ? ` and built-ins ${r.builtIns.join(', ')}` : ''}.`);
    write(r.exported, o.out);
  });

withSelection(program.command('combine'))
  .argument('<base>')
  .argument('<incoming>')
  .option('-o, --out <file>', 'output file (default: stdout)')
  .addOption(new Option('--on-conflict <policy>', 'what to do when names clash').choices(['rename', 'keepBase', 'replace']).default('rename'))
  .description('copy entities from <incoming> into <base> (all of them unless selected)')
  .action((baseFile: string, inFile: string, o: Record<string, string[] | undefined> & { out?: string; onConflict: ConflictPolicy }) => {
    const incoming = load(inFile);
    const refs = selection(new ContainerIndex(incoming), selectionOpts(o));
    const { exported, report } = combine(load(baseFile), incoming, {
      selection: refs.length ? refs : undefined,
      onConflict: o.onConflict,
    });
    console.error(
      `Added ${report.added.length}, renamed ${report.renamed.length}, replaced ${report.replaced.length}, kept base ${report.keptBase.length}.`,
    );
    report.renamed.forEach((r) => console.error(`  renamed ${r.kind} "${r.from}" -> "${r.to}"`));
    write(exported, o.out);
  });

program
  .command('fix')
  .argument('<file>')
  .option('-o, --out <file>', 'output file (default: stdout)')
  .description('apply automatic repairs (enable missing built-ins, normalize exportTime, ...)')
  .action((file: string, o: { out?: string }) => {
    const { exported, applied } = autoFix(load(file));
    applied.forEach((a) => console.error(`  ${a}`));
    if (!applied.length) console.error('Nothing to fix.');
    write(exported, o.out);
  });

program.parse();
