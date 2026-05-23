import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';

type Props = {
  variant: 'create' | 'edit';
  sectionMode: BoolMode;
  initialName?: string;
  initialQuery?: Record<string, unknown>;
  collapsible?: boolean;
  onSubmit: (payload: { name: string; query: Record<string, unknown> }) => void;
  onCancel?: () => void;
};

const EXAMPLE = JSON.stringify({ term: { status: 'active' } }, null, 2);

export function CustomBlockForm({
  variant,
  sectionMode,
  initialName,
  initialQuery,
  collapsible,
  onSubmit,
  onCancel,
}: Props) {
  const meta = MODE_META[sectionMode];
  const [name, setName] = useState(initialName ?? '');
  const [queryText, setQueryText] = useState(
    initialQuery ? JSON.stringify(initialQuery, null, 2) : EXAMPLE
  );
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsible || variant === 'edit');

  useEffect(() => {
    setName(initialName ?? '');
    setQueryText(initialQuery ? JSON.stringify(initialQuery, null, 2) : EXAMPLE);
    setError(null);
  }, [initialName, initialQuery]);

  const reset = () => {
    setName('');
    setQueryText(EXAMPLE);
    setError(null);
  };

  const submit = () => {
    const finalName = name.trim() || `Custom #${Math.floor(Math.random() * 900 + 100)}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(queryText);
    } catch (e) {
      setError(`Invalid JSON: ${(e as Error).message}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setError('Query must be a JSON object.');
      return;
    }
    onSubmit({ name: finalName, query: parsed as Record<string, unknown> });
    if (variant === 'create') reset();
  };

  if (collapsible && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed ${meta.softBorder} ${meta.softBg} px-3 py-2 text-xs font-medium ${meta.accentText} transition hover:bg-white`}
      >
        <span className="font-mono">{'{ }'}</span>
        Write a custom block in <span className="font-mono">{meta.label}</span>
      </button>
    );
  }

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] ${meta.accentText} ${meta.softBorder}`}>
          {'{ }'} {variant === 'edit' ? 'editing block' : 'new block'} in {meta.label}
        </span>
        {collapsible && variant === 'create' && (
          <button
            onClick={() => setOpen(false)}
            className="ml-auto rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            title="Collapse"
          >
            ×
          </button>
        )}
      </div>

      <input
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        placeholder="Block name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="mt-2 overflow-hidden rounded-md border border-neutral-300 bg-white">
        <div style={{ height: 140 }}>
          <Editor
            value={queryText}
            language="json"
            theme="vs"
            onChange={(v) => setQueryText(v ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              padding: { top: 6, bottom: 6 },
              renderLineHighlight: 'none',
            }}
          />
        </div>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {variant === 'edit' && onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Cancel
          </button>
        )}
        {variant === 'create' && (
          <button
            onClick={reset}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            Reset
          </button>
        )}
        <button
          onClick={submit}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800"
        >
          {variant === 'edit' ? 'Save changes' : `+ Add to ${meta.label}`}
        </button>
      </div>
    </div>
  );
}
