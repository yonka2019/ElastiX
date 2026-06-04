import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, buildQuery } from '../store';

type CountState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; count: number; at: number }
  | { kind: 'err'; message: string };

// Normalise an error payload to a human string. Elasticsearch returns
// `{ error: { type, reason, root_cause } }`; our middleware returns
// `{ error: "message" }`. Either way we want readable text, never `[object
// Object]` (which would also crash React if rendered as a child).
function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { reason?: string; type?: string };
    if (e.reason) return e.type ? `${e.type}: ${e.reason}` : e.reason;
    return JSON.stringify(error);
  }
  return String(error);
}

// Header widget: live doc count for the generated query — result chip,
// auto-count switch, and the "Count docs" button.
export function CountDocs() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const config = useStore((s) => s.config);
  // Toggled in Settings → Docs count.
  const autoCount = useStore((s) => s.autoCount);
  const [count, setCount] = useState<CountState>({ kind: 'idle' });
  // Monotonic id per count request — a stale response (older id) must not
  // overwrite the result of a newer one when auto mode fires in succession.
  const countSeq = useRef(0);

  const built = useMemo(() => buildQuery(templates, blocks), [templates, blocks]);

  const runCount = useCallback(async () => {
    const seq = ++countSeq.current;
    // Only the latest request may write state — see countSeq above.
    const apply = (s: CountState) => {
      if (countSeq.current === seq) setCount(s);
    };
    apply({ kind: 'loading' });
    try {
      const inner = (built as { query?: Record<string, unknown> }).query ?? { match_all: {} };
      const res = await fetch('/api/count', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: inner }),
      });
      const rawBody = await res.text();
      let data: { count?: number; error?: unknown } = {};
      try {
        data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
      } catch {
        // Non-JSON response — e.g. an HTML error page from a proxy, or no
        // backend at all (static build / `vite preview` without server.js).
        apply({ kind: 'err', message: rawBody.slice(0, 200) || `HTTP ${res.status}` });
        return;
      }
      if (!res.ok) {
        apply({ kind: 'err', message: errorMessage(data.error) || `HTTP ${res.status}` });
        return;
      }
      if (typeof data.count !== 'number') {
        apply({ kind: 'err', message: 'Unexpected response (no count)' });
        return;
      }
      apply({ kind: 'ok', count: data.count, at: Date.now() });
    } catch (err) {
      apply({ kind: 'err', message: (err as Error).message });
    }
  }, [built]);

  // Auto mode: re-count whenever the generated query changes, debounced so
  // rapid edits don't fire a request per keystroke. Also fires once on
  // toggle-on (and on mount when the persisted toggle is on).
  useEffect(() => {
    if (!autoCount || !config.ready) return;
    const t = setTimeout(() => {
      void runCount();
    }, 800);
    return () => clearTimeout(t);
  }, [autoCount, config.ready, runCount]);

  const formatCount = (n: number) => n.toLocaleString();

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      {count.kind === 'ok' && (
        <span
          // Keyed by the result timestamp so each fresh count remounts the
          // chip and replays the one-shot pop animation (see index.css).
          key={count.at}
          className="count-pop inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          title={`Matched on index pattern ${config.indexPattern}`}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden>
            <path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z" />
          </svg>
          {formatCount(count.count)} docs
        </span>
      )}
      {count.kind === 'err' && (
        <span
          className="max-w-[260px] truncate rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 font-mono text-[11px] text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
          title={count.message}
        >
          count failed: {count.message}
        </span>
      )}
      <button
        onClick={() => void runCount()}
        disabled={!config.ready || count.kind === 'loading'}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
        title={
          config.ready
            ? `Count matching docs on ${config.indexPattern}`
            : 'Set ELASTIC_URL + creds in .env to enable'
        }
      >
        {count.kind === 'loading' ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 7h11" />
            <path d="M9 12h11" />
            <path d="M9 17h11" />
            <circle cx="4.5" cy="7" r="1" />
            <circle cx="4.5" cy="12" r="1" />
            <circle cx="4.5" cy="17" r="1" />
          </svg>
        )}
        <span className="hidden sm:inline">{count.kind === 'loading' ? 'Counting…' : 'Count docs'}</span>
      </button>
    </div>
  );
}
