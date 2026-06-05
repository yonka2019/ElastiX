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
      {/* Solid gradient pill — the one "talk to Elastic" action in the
          header, so it gets the strongest visual weight. Disabled state
          drops the gradient (bg-none) and falls back to a muted flat chip. */}
      <button
        onClick={() => void runCount()}
        disabled={!config.ready || count.kind === 'loading'}
        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-white/50 via-blue-50/50 to-blue-100/50 px-3 py-1 text-xs font-semibold text-blue-800 shadow-sm shadow-blue-200/30 ring-1 ring-inset ring-blue-200/70 transition-all hover:shadow-md hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:bg-none disabled:bg-neutral-100 disabled:text-neutral-500 disabled:shadow-none disabled:ring-neutral-200 dark:from-blue-400/15 dark:via-blue-500/20 dark:to-blue-600/25 dark:text-blue-200 dark:shadow-blue-950/40 dark:ring-blue-400/40 dark:hover:brightness-110 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-400 dark:disabled:ring-neutral-700"
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
          // Tally marks — four strokes and the crossing fifth: counting.
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 5v14" />
            <path d="M9.5 5v14" />
            <path d="M14 5v14" />
            <path d="M18.5 5v14" />
            <path d="M3 16L21 8" />
          </svg>
        )}
        <span className="hidden sm:inline">{count.kind === 'loading' ? 'Counting…' : 'Count docs'}</span>
      </button>
    </div>
  );
}
