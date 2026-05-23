import { useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';

type Props = {
  sectionMode: BoolMode;
  initialField: string;
  onSubmit: (patch: { field: string }) => void;
  onCancel: () => void;
};

export function ExistsForm({ sectionMode, initialField, onSubmit, onCancel }: Props) {
  const meta = MODE_META[sectionMode];
  const [field, setField] = useState(initialField);
  const canSave = field.trim().length > 0;

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] ${meta.accentText} ${meta.softBorder}`}
        >
          ⊙ exists in {meta.label}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Field
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none"
        value={field}
        onChange={(e) => setField(e.target.value)}
        placeholder="field.name"
        spellCheck={false}
      />

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
          will save as
        </div>
        <div className="break-all">{`{ "exists": { "field": "${field.trim() || '…'}" } }`}</div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          onClick={() => canSave && onSubmit({ field: field.trim() })}
          disabled={!canSave}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Save exists
        </button>
      </div>
    </div>
  );
}
