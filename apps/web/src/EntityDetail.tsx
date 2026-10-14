import { useState } from 'react';
import { idOf, type ContainerExport, type ContainerIndex, type Entity, type EntityRef } from '@gtm-editor/core';
import { idField, replaceEntity } from './state';

interface Props {
  exported: ContainerExport;
  index: ContainerIndex;
  entityRef: EntityRef;
  onNavigate: (ref: EntityRef) => void;
  onChange: (exported: ContainerExport, message: string) => void;
}

export function EntityDetail({ exported, index, entityRef, onNavigate, onChange }: Props) {
  const entity = index.get(entityRef)!;
  const [draft, setDraft] = useState(() => JSON.stringify(entity, null, 2));
  const [draftError, setDraftError] = useState<string | null>(null);
  const dirty = draft !== JSON.stringify(entity, null, 2);

  const apply = () => {
    let next: Entity;
    try {
      next = JSON.parse(draft) as Entity;
    } catch (e) {
      setDraftError(`Not valid JSON: ${(e as Error).message}`);
      return;
    }
    if (idOf(entityRef.kind, next) !== entityRef.id) {
      setDraftError(`Keep ${idField(entityRef.kind)} as "${entityRef.id}"; IDs are managed by the editor.`);
      return;
    }
    setDraftError(null);
    onChange(replaceEntity(exported, entityRef, next), `Updated ${entityRef.kind} "${next.name}".`);
  };

  const refs = index.references(entityRef);
  const usedBy = index.usedBy(entityRef);

  return (
    <div>
      <h2>{entity.name}</h2>
      <p className="muted small">
        {entityRef.kind} {entityRef.id}
        {(entity as { type?: string }).type && <> · type {(entity as { type?: string }).type}</>}
      </p>
      {entity.notes && <p className="notes">{entity.notes}</p>}

      <div className="cols">
        <div>
          <h3>References</h3>
          <ul className="refs">
            {refs.map(({ reference, target }, i) => {
              const label =
                reference.to === 'trigger' || reference.to === 'folder'
                  ? reference.id
                  : reference.to === 'customTemplate'
                    ? reference.templateId
                    : reference.name;
              if (target.status === 'entity') {
                return (
                  <li key={i} className="link" onClick={() => onNavigate(target.ref)}>
                    {reference.to} · {index.get(target.ref)?.name}
                  </li>
                );
              }
              const what =
                target.status === 'builtInTrigger'
                  ? `built-in trigger (${target.name})`
                  : target.status === 'builtInVariable'
                    ? 'built-in variable'
                    : target.status === 'reserved'
                      ? 'reserved'
                      : 'MISSING';
              return (
                <li key={i} className={target.status === 'missing' ? 'error' : 'muted'}>
                  {reference.to} · {label} · {what}
                </li>
              );
            })}
            {!refs.length && <li className="muted">None</li>}
          </ul>
        </div>
        <div>
          <h3>Used by</h3>
          <ul className="refs">
            {usedBy.map((u, i) => (
              <li key={i} className="link" onClick={() => onNavigate(u.from)}>
                {u.from.kind} · {index.get(u.from)?.name}
              </li>
            ))}
            {!usedBy.length && <li className="muted">Nothing</li>}
          </ul>
        </div>
      </div>

      <h3>JSON</h3>
      <textarea className="json" spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
      {draftError && <p className="error">{draftError}</p>}
      <div className="actions">
        <button className="primary" disabled={!dirty} onClick={apply}>
          Apply changes
        </button>
        <button disabled={!dirty} onClick={() => (setDraft(JSON.stringify(entity, null, 2)), setDraftError(null))}>
          Revert
        </button>
      </div>
    </div>
  );
}
