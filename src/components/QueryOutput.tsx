import { useMemo, useState } from 'react';
import { useStore, buildQuery, modeOccurrences, totalItemCount } from '../store';
import { MODE_META, MODE_ORDER } from '../types';
import { JsonTree } from './JsonTree';

type CountState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; count: number; at: number }
  | { kind: 'err'; message: string };

export function QueryOutput() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const config = useStore((s) => s.config);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [count, setCount] = useState<CountState>({ kind: 'idle' });

  const built = useMemo(() => buildQuery(templates, blocks), [templates, blocks]);
  const json = useMemo(() => JSON.stringify(built, null, 2), [built]);

  const counts = modeOccurrences(blocks);
  const total = totalItemCount(blocks);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const runCount = async () => {
    setCount({ kind: 'loading' });
    try {
      const inner = (built as { query?: Record<string, unknown> }).query ?? { match_all: {} };
      const res = await fetch('/api/count', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: inner }),
      });
      const data = (await res.json()) as { count?: number; error?: string };
      if (!res.ok) {
        setCount({ kind: 'err', message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      if (typeof data.count !== 'number') {
        setCount({ kind: 'err', message: 'Unexpected response (no count)' });
        return;
      }
      setCount({ kind: 'ok', count: data.count, at: Date.now() });
    } catch (err) {
      setCount({ kind: 'err', message: (err as Error).message });
    }
  };

  const formatCount = (n: number) => n.toLocaleString();

  return (
    <section
      className={[
        'flex shrink-0 flex-col border-b border-neutral-200 bg-white transition-[height] duration-200 dark:border-neutral-800 dark:bg-neutral-900',
        expanded ? 'h-72' : 'h-10',
      ].join(' ')}
    >
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex cursor-pointer items-center gap-3 border-b border-blue-200 bg-gradient-to-r from-sky-50 via-blue-50 to-indigo-50 px-5 py-2 hover:from-sky-100 hover:via-blue-100 hover:to-indigo-100 dark:border-blue-900 dark:from-sky-950 dark:via-blue-950 dark:to-indigo-950 dark:hover:from-sky-900 dark:hover:via-blue-900 dark:hover:to-indigo-900"
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="flex items-center gap-1 rounded p-0.5 text-blue-700 transition-colors hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
          title={expanded ? 'Minimize generated query' : 'Expand generated query'}
          aria-label={expanded ? 'Minimize' : 'Expand'}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 15l6-6 6 6" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">Generated Query</span>
        {!expanded && (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-blue-600/80 dark:text-blue-300/80">
            click to expand ▾
          </span>
        )}
        {total === 0 ? (
          <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">empty → match_all</span>
        ) : (
          <span className="flex items-center gap-1.5">
            {MODE_ORDER.filter((m) => counts[m] > 0).map((m) => {
              const meta = MODE_META[m];
              return (
                <span
                  key={m}
                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] ${meta.chip}`}
                >
                  <span className={`inline-block h-1 w-1 rounded-full ${meta.dot}`} />
                  {meta.label} {counts[m]}
                </span>
              );
            })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {count.kind === 'ok' && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
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
            onClick={(e) => {
              e.stopPropagation();
              void runCount();
            }}
            disabled={!config.ready || count.kind === 'loading'}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-neutral-50 disabled:text-neutral-400 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
            title={
              config.ready
                ? `Count matching docs on ${config.indexPattern}`
                : 'Set ELASTIC_URL + creds in .env to enable'
            }
          >
            {count.kind === 'loading' ? 'Counting…' : 'Count docs'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              void copy();
            }}
            className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-900"
          >
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex-1 min-h-0 overflow-auto bg-white px-4 py-3 dark:bg-neutral-950">
          <JsonTree value={built} />
        </div>
      )}
    </section>
  );
}
