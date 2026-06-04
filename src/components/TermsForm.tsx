import { useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';
import { stripWrappingQuotes, termsOutputValues } from '../utils/terms';

type Props = {
  sectionMode: BoolMode;
  initialTitle?: string;
  initialField: string;
  initialValues: string[];
  initialNumeric?: boolean;
  onSubmit: (patch: { title?: string; field: string; values: string[]; numeric: boolean }) => void;
  onCancel: () => void;
};

export function TermsForm({
  sectionMode,
  initialTitle,
  initialField,
  initialValues,
  initialNumeric,
  onSubmit,
  onCancel,
}: Props) {
  const meta = MODE_META[sectionMode];
  const [title, setTitle] = useState(initialTitle ?? '');
  const [field, setField] = useState(initialField);
  const [values, setValues] = useState<string[]>(initialValues);
  const [numeric, setNumeric] = useState(Boolean(initialNumeric));
  const [draft, setDraft] = useState('');
  const canSave = field.trim().length > 0 && values.length > 0;

  const submit = () => {
    if (!canSave) return;
    onSubmit({ title: title.trim() || undefined, field: field.trim(), values: values.slice(), numeric });
  };

  // Accepts a single value OR a comma-separated list. Empty entries dropped,
  // duplicates (against current and within the input) skipped. Wrapping
  // quotes are stripped ('"test"' → 'test') so pasted JSON values don't end
  // up double-quoted in the generated query (""test"").
  const addValues = (raw: string) => {
    const next = [...values];
    for (const part of raw.split(',')) {
      const t = stripWrappingQuotes(part);
      if (!t) continue;
      if (next.includes(t)) continue;
      next.push(t);
    }
    if (next.length !== values.length) setValues(next);
  };
  const removeValue = (v: string) => setValues(values.filter((x) => x !== v));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          submit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-900 ${meta.accentText} ${meta.softBorder}`}
        >
          [⋯] terms (multi value) in {meta.label}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Title (optional)
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. allowed regions"
        spellCheck={false}
      />

      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Field
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
        value={field}
        onChange={(e) => setField(e.target.value)}
        placeholder="field.name"
        spellCheck={false}
      />

      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Values ({values.length})
      </label>

      {values.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 font-mono text-[11px] text-fuchsia-800 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300"
            >
              {v}
              <button
                type="button"
                onClick={() => removeValue(v)}
                className="rounded-full text-fuchsia-600 hover:bg-fuchsia-200 hover:text-fuchsia-900 dark:text-fuchsia-400 dark:hover:bg-fuchsia-900 dark:hover:text-fuchsia-100"
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
          className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
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
          className="rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300 dark:hover:bg-fuchsia-900"
        >
          Add
        </button>
      </div>

      <label className="mt-2.5 flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={numeric}
          onChange={(e) => setNumeric(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded border-neutral-300 accent-fuchsia-600 dark:border-neutral-600"
        />
        <span className="text-xs text-neutral-700 dark:text-neutral-200">
          Parse numbers as numbers
          <span className="block text-[10px] leading-snug text-neutral-400 dark:text-neutral-500">
            numeric values are emitted unquoted — 123 instead of "123"
          </span>
        </span>
      </label>

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          will save as
        </div>
        <div className="break-all">{`{ "terms": { "${field.trim() || '…'}": [${
          values.length
            ? termsOutputValues(values, numeric).map((v) => JSON.stringify(v)).join(', ')
            : '…'
        }] } }`}</div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
        >
          Save terms
        </button>
      </div>
    </form>
  );
}
