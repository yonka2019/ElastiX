import { useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';

type Props = {
  sectionMode: BoolMode;
  initialTitle?: string;
  initialField: string;
  initialValue: string;
  onSubmit: (patch: { title?: string; field: string; value: string }) => void;
  onCancel: () => void;
};

export function TermForm({ sectionMode, initialTitle, initialField, initialValue, onSubmit, onCancel }: Props) {
  const meta = MODE_META[sectionMode];
  const [title, setTitle] = useState(initialTitle ?? '');
  const [field, setField] = useState(initialField);
  const [value, setValue] = useState(initialValue);
  const canSave = field.trim().length > 0 && value.trim().length > 0;

  const submit = () => {
    if (!canSave) return;
    onSubmit({ title: title.trim() || undefined, field: field.trim(), value: value.trim() });
  };

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
          ≡ term (single value) in {meta.label}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Title (optional)
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. prod env filter"
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
        Value
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="value"
        spellCheck={false}
      />

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          will save as
        </div>
        <div className="break-all">{`{ "term": { "${field.trim() || '…'}": "${value.trim() || '…'}" } }`}</div>
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
          Save term
        </button>
      </div>
    </form>
  );
}
