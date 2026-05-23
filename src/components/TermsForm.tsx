import { useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';

type Props = {
  sectionMode: BoolMode;
  initialField: string;
  initialValues: string[];
  onSubmit: (patch: { field: string; values: string[] }) => void;
  onCancel: () => void;
};

export function TermsForm({
  sectionMode,
  initialField,
  initialValues,
  onSubmit,
  onCancel,
}: Props) {
  const meta = MODE_META[sectionMode];
  const [field, setField] = useState(initialField);
  const [values, setValues] = useState<string[]>(initialValues);
  const [draft, setDraft] = useState('');
  const canSave = field.trim().length > 0 && values.length > 0;

  // Accepts a single value OR a comma-separated list. Empty entries dropped,
  // duplicates (against current and within the input) skipped.
  const addValues = (raw: string) => {
    const next = [...values];
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (!t) continue;
      if (next.includes(t)) continue;
      next.push(t);
    }
    if (next.length !== values.length) setValues(next);
  };
  const removeValue = (v: string) => setValues(values.filter((x) => x !== v));

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] ${meta.accentText} ${meta.softBorder}`}
        >
          ▦ terms (multi value) in {meta.label}
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

      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Values ({values.length})
      </label>

      {values.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 font-mono text-[11px] text-fuchsia-800"
            >
              {v}
              <button
                onClick={() => removeValue(v)}
                className="rounded-full text-fuchsia-600 hover:bg-fuchsia-200 hover:text-fuchsia-900"
                title={`Remove ${v}`}
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addValues(draft);
              setDraft('');
            }
          }}
          placeholder="type values separated by , then ↵"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => {
            addValues(draft);
            setDraft('');
          }}
          disabled={!draft.trim()}
          className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
          will save as
        </div>
        <div className="break-all">{`{ "terms": { "${field.trim() || '…'}": [${
          values.length ? values.map((v) => `"${v}"`).join(', ') : '…'
        }] } }`}</div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            canSave && onSubmit({ field: field.trim(), values: values.slice() })
          }
          disabled={!canSave}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Save terms
        </button>
      </div>
    </div>
  );
}
