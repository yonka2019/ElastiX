import { useEffect, useRef, useState } from 'react';
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

  const format = () => {
    try {
      const parsed = JSON.parse(queryText);
      setQueryText(JSON.stringify(parsed, null, 2));
      setError(null);
    } catch {
      // Invalid JSON — leave as-is so the user can fix it.
    }
  };

  if (collapsible && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed ${meta.softBorder} ${meta.softBg} px-3 py-2 text-xs font-medium ${meta.accentText} transition hover:bg-white dark:hover:bg-neutral-900`}
      >
        <span className="font-mono">{'{ }'}</span>
        Write a custom block in <span className="font-mono">{meta.label}</span>
      </button>
    );
  }

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-900 ${meta.accentText} ${meta.softBorder}`}>
          {'{ }'} {variant === 'edit' ? 'editing block' : 'new block'} in {meta.label}
        </span>
        {collapsible && variant === 'create' && (
          <button
            onClick={() => setOpen(false)}
            className="ml-auto rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="Collapse"
          >
            ×
          </button>
        )}
      </div>

      <input
        className="w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
        placeholder="Block name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className="mt-2">
        <HighlightedJsonEditor value={queryText} onChange={setQueryText} />
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={format}
          title="Pretty-print the JSON (no-op if invalid)"
          className="mr-auto rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          Format
        </button>
        {variant === 'edit' && onCancel && (
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Cancel
          </button>
        )}
        {variant === 'create' && (
          <button
            onClick={reset}
            className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Reset
          </button>
        )}
        <button
          onClick={submit}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {variant === 'edit' ? 'Save changes' : `+ Add to ${meta.label}`}
        </button>
      </div>
    </div>
  );
}

// JSON syntax highlighting that appears live in the editor.
// A pre with colored tokens is layered under a transparent textarea
// (caret-only). Their geometry is identical so the tokens render exactly
// where the typed characters would. Scroll positions are synced.
type TokenType = 'string' | 'key' | 'number' | 'boolean' | 'null' | 'punct' | 'whitespace' | 'unknown';
type Token = { type: TokenType; text: string };

function tokenizeJson(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];

    if (c === '"') {
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === '\\') {
          j += 2;
          continue;
        }
        if (input[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      const text = input.slice(i, j);
      let k = j;
      while (k < input.length && /\s/.test(input[k])) k++;
      const isKey = input[k] === ':';
      tokens.push({ type: isKey ? 'key' : 'string', text });
      i = j;
      continue;
    }

    if (c === '-' || (c >= '0' && c <= '9')) {
      const m = input.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (m) {
        tokens.push({ type: 'number', text: m[0] });
        i += m[0].length;
        continue;
      }
    }

    if (input.startsWith('true', i)) {
      tokens.push({ type: 'boolean', text: 'true' });
      i += 4;
      continue;
    }
    if (input.startsWith('false', i)) {
      tokens.push({ type: 'boolean', text: 'false' });
      i += 5;
      continue;
    }
    if (input.startsWith('null', i)) {
      tokens.push({ type: 'null', text: 'null' });
      i += 4;
      continue;
    }

    if ('{}[],:'.includes(c)) {
      tokens.push({ type: 'punct', text: c });
      i++;
      continue;
    }

    if (/\s/.test(c)) {
      let j = i;
      while (j < input.length && /\s/.test(input[j])) j++;
      tokens.push({ type: 'whitespace', text: input.slice(i, j) });
      i = j;
      continue;
    }

    tokens.push({ type: 'unknown', text: c });
    i++;
  }
  return tokens;
}

const TOKEN_CLASS: Record<TokenType, string> = {
  key: 'text-sky-700 dark:text-sky-300',
  string: 'text-emerald-700 dark:text-emerald-300',
  number: 'text-amber-700 dark:text-amber-400',
  boolean: 'text-rose-700 dark:text-rose-400',
  null: 'text-rose-700 dark:text-rose-400',
  punct: 'text-neutral-500 dark:text-neutral-400',
  whitespace: '',
  unknown: 'text-rose-600 underline decoration-wavy dark:text-rose-400',
};

function HighlightedJsonEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const syncScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  const tokens = tokenizeJson(value);

  // Shared text geometry: same font, padding, leading, wrap. The pre is
  // absolutely positioned over the textarea; the textarea has transparent
  // text but a visible caret.
  const sharedClasses =
    'block w-full rounded-md border font-mono text-[12px] leading-relaxed p-2 whitespace-pre-wrap break-words';

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const ta = e.currentTarget;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const indent = '  ';
            if (!e.shiftKey) {
              const next = value.slice(0, start) + indent + value.slice(end);
              onChange(next);
              requestAnimationFrame(() => {
                ta.selectionStart = ta.selectionEnd = start + indent.length;
              });
            } else {
              // De-indent the current line: strip up to 2 leading spaces.
              const lineStart = value.lastIndexOf('\n', start - 1) + 1;
              const lineRest = value.slice(lineStart);
              const stripped = lineRest.replace(/^ {1,2}/, '');
              const removed = lineRest.length - stripped.length;
              if (removed > 0) {
                const next = value.slice(0, lineStart) + stripped;
                onChange(next);
                requestAnimationFrame(() => {
                  const newCaret = Math.max(lineStart, start - removed);
                  ta.selectionStart = ta.selectionEnd = newCaret;
                });
              }
            }
          }
        }}
        spellCheck={false}
        rows={7}
        className={`${sharedClasses} relative block resize-y border-neutral-300 bg-white text-transparent caret-neutral-900 focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:caret-neutral-100`}
      />
      {/* Rendered AFTER the textarea in DOM so it stacks visually on top of
          the white background but lets clicks pass through. */}
      <pre
        ref={preRef}
        aria-hidden
        className={`${sharedClasses} pointer-events-none absolute inset-0 overflow-hidden border-transparent bg-transparent text-neutral-900 dark:text-neutral-100`}
      >
        {tokens.map((tok, i) => (
          <span key={i} className={TOKEN_CLASS[tok.type]}>
            {tok.text}
          </span>
        ))}
        {/* Trailing newline so the pre's height matches the textarea when
            input ends with a blank line. */}
        {'\n'}
      </pre>
    </div>
  );
}
