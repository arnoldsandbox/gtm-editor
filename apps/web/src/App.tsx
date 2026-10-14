import { useMemo, useState } from 'react';
import {
  autoFix,
  ContainerIndex,
  dependencyClosure,
  extract,
  idOf,
  parseContainer,
  serialize,
  summarize,
  validate,
  type ContainerExport,
  type EntityKind,
  type EntityRef,
  type Issue,
} from '@gtm-editor/core';
import { DropZone } from './DropZone';
import { EntityDetail } from './EntityDetail';
import { deleteEntities, download, KIND_LABEL, KINDS, sameRef } from './state';

interface Loaded {
  fileName: string;
  exported: ContainerExport;
}

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<EntityKind>('tag');
  const [search, setSearch] = useState('');
  const [current, setCurrent] = useState<EntityRef | null>(null);
  const [picked, setPicked] = useState<Map<string, EntityRef>>(new Map());
  const [notice, setNotice] = useState<string | null>(null);

  const index = useMemo(() => (loaded ? new ContainerIndex(loaded.exported) : null), [loaded]);
  const validation = useMemo(() => (loaded ? validate(loaded.exported) : null), [loaded]);
  const errors = validation?.issues.filter((i) => i.severity === 'error') ?? [];

  const open = (fileName: string, text: string) => {
    const r = parseContainer(text);
    if (!r.ok) {
      setLoadError(`${fileName}: ${r.error}`);
      return;
    }
    setLoadError(null);
    setLoaded({ fileName, exported: r.exported });
    setCurrent(null);
    setPicked(new Map());
    setNotice(null);
  };

  if (!loaded || !index || !validation) {
    return (
      <main className="landing">
        <h1>GTM Editor</h1>
        <p className="muted">
          Open a Google Tag Manager container export to browse, edit, extract and download it. Files stay in your
          browser and are never uploaded.
        </p>
        <DropZone onFile={open} />
        {loadError && <p className="error">{loadError}</p>}
      </main>
    );
  }

  const summary = summarize(loaded.exported);
  const baseName = loaded.fileName.replace(/\.json$/i, '');
  const update = (exported: ContainerExport, message?: string) => {
    setLoaded({ ...loaded, exported });
    setNotice(message ?? null);
  };

  const needle = search.trim().toLowerCase();
  const rows = index
    .all(kind)
    .filter((e) => !needle || JSON.stringify(e).toLowerCase().includes(needle));
  const folderName = (id?: string) => (id ? index.get({ kind: 'folder', id })?.name : undefined);

  const pickedRefs = [...picked.values()];
  const closureSize = pickedRefs.length ? dependencyClosure(index, pickedRefs).entities.size : 0;
  const togglePick = (ref: EntityRef) => {
    const next = new Map(picked);
    const key = `${ref.kind}:${ref.id}`;
    if (next.has(key)) next.delete(key);
    else next.set(key, ref);
    setPicked(next);
  };

  const downloadAll = () => download(`${baseName}_edited.json`, serialize(loaded.exported));
  const downloadExtract = () => {
    const r = extract(loaded.exported, pickedRefs);
    download(`${baseName}_extract.json`, serialize(r.exported));
    setNotice(`Extracted ${r.included.length} entities into ${baseName}_extract.json.`);
  };
  const runFix = () => {
    const r = autoFix(loaded.exported);
    update(r.exported, r.applied.length ? r.applied.join(' · ') : 'Nothing to fix.');
  };
  const deletePicked = () => {
    update(deleteEntities(loaded.exported, pickedRefs), `Deleted ${pickedRefs.length} entities.`);
    setPicked(new Map());
    if (pickedRefs.some((r) => sameRef(r, current))) setCurrent(null);
  };

  return (
    <div className="app">
      <header className="bar">
        <div>
          <strong>{summary.publicId ?? 'Container'}</strong> <span className="muted">{summary.name}</span>
          <span className="pill">{(summary.usageContext ?? []).join(', ')}</span>
          <span className="muted small"> {loaded.fileName}</span>
        </div>
        <div className="actions">
          {validation.issues.some((i) => i.fixable) && <button onClick={runFix}>Auto-fix</button>}
          <button className="primary" disabled={errors.length > 0} onClick={downloadAll} title={errors.length ? 'Fix the errors first' : ''}>
            Download container
          </button>
          <button onClick={() => setLoaded(null)}>Open another</button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}
      <Issues issues={validation.issues} onSelect={(ref) => ref && (setKind(ref.kind), setCurrent(ref))} index={index} />

      <div className="body">
        <section className="list">
          <nav className="tabs">
            {KINDS.map((k) => (
              <button key={k} className={k === kind ? 'active' : ''} onClick={() => setKind(k)}>
                {KIND_LABEL[k]} <span className="muted">{index.all(k).length}</span>
              </button>
            ))}
          </nav>
          <input
            className="search"
            placeholder="Search names, types and values"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <ul>
            {rows.map((e) => {
              const ref = { kind, id: idOf(kind, e) };
              const key = `${kind}:${ref.id}`;
              return (
                <li key={key} className={sameRef(ref, current) ? 'current' : ''} onClick={() => setCurrent(ref)}>
                  <input
                    type="checkbox"
                    checked={picked.has(key)}
                    onClick={(ev) => ev.stopPropagation()}
                    onChange={() => togglePick(ref)}
                    aria-label={`Select ${e.name}`}
                  />
                  <span className="name">{e.name}</span>
                  <span className="muted small">{(e as { type?: string }).type}</span>
                  {folderName(e.parentFolderId) && <span className="pill">{folderName(e.parentFolderId)}</span>}
                </li>
              );
            })}
            {!rows.length && <li className="muted">Nothing matches.</li>}
          </ul>
        </section>

        <section className="detail">
          {current && index.get(current) ? (
            <EntityDetail
              key={`${current.kind}:${current.id}`}
              exported={loaded.exported}
              index={index}
              entityRef={current}
              onNavigate={(ref) => (setKind(ref.kind), setCurrent(ref))}
              onChange={(exported, message) => update(exported, message)}
            />
          ) : (
            <p className="muted">Select an entity to see its settings, what it references and what uses it.</p>
          )}
        </section>
      </div>

      {pickedRefs.length > 0 && (
        <footer className="bar selection">
          <span>
            {pickedRefs.length} selected, {closureSize} with dependencies
          </span>
          <div className="actions">
            <button className="primary" onClick={downloadExtract}>
              Download as importable container
            </button>
            <button onClick={deletePicked}>Delete</button>
            <button onClick={() => setPicked(new Map())}>Clear</button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Issues({
  issues,
  index,
  onSelect,
}: {
  issues: Issue[];
  index: ContainerIndex;
  onSelect: (ref: EntityRef | undefined) => void;
}) {
  if (!issues.length) return <div className="status ok">Valid: this container should import cleanly.</div>;
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <details className={`status ${errors ? 'bad' : 'warn'}`} open={errors > 0}>
      <summary>
        {errors ? `${errors} error(s) block download` : 'No errors'}, {issues.length - errors} warning(s)
      </summary>
      <ul>
        {issues.map((i, n) => (
          <li key={n} onClick={() => onSelect(i.entity)} className={i.entity && index.get(i.entity) ? 'link' : ''}>
            <span className={`sev ${i.severity}`}>{i.severity}</span> {i.message}
            {i.fixable && <span className="muted small"> (auto-fixable)</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}
