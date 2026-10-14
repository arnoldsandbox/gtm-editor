import { useRef, useState } from 'react';

export function DropZone({ onFile }: { onFile: (name: string, text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const read = async (file: File | undefined) => file && onFile(file.name, await file.text());

  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void read(e.dataTransfer.files[0]);
      }}
    >
      <p>
        Drop a container export (<code>.json</code>) here, or click to choose one.
      </p>
      <p className="muted small">In GTM: Admin → Export Container.</p>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void read(e.target.files?.[0])} />
    </div>
  );
}
