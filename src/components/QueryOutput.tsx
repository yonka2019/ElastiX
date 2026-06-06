import { useMemo, useRef, useState } from 'react';
import { useStore, buildQuery, modeOccurrences, totalItemCount } from '../store';
import { MODE_META, MODE_ORDER } from '../types';
import { JsonTree } from './JsonTree';
import { parseQueryToBlocks } from '../utils/importQuery';
import { titleSlug } from '../utils/ids';

export function QueryOutput() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const replaceBlocks = useStore((s) => s.replaceBlocks);
  const queryTitle = useStore((s) => s.queryTitle);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const importRawQuery = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      const parsed = parseQueryToBlocks(data);
      if (parsed.empty || parsed.blocks.length === 0) {
        setImportError('No clauses found (match_all or empty).');
        return;
      }
      if (blocks.length > 0) {
        const ok = window.confirm(
          'Replace the current builder with the imported query? Your current blocks will be lost.'
        );
        if (!ok) return;
      }
      replaceBlocks(parsed.blocks);
    } catch (err) {
      setImportError(`Failed to import: ${(err as Error).message}`);
    }
  };

  const exportJson = () => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const slug = titleSlug(queryTitle);
    a.href = url;
    a.download = `elastix-query-${slug ? `${slug}-` : ''}${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className={[
        // easeOutExpo (same curve as .enter) + 300ms so the open/close reads
        // as a slide rather than a lurch — 200ms with the default ease over a
        // ~250px height change was perceived as the panel "jumping".
        'flex shrink-0 flex-col border-b border-neutral-200 bg-white transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] dark:border-neutral-800 dark:bg-neutral-900',
        expanded ? 'h-72' : 'h-10',
      ].join(' ')}
    >
      <div
        onClick={() => setExpanded((v) => !v)}
        className="query-headline-flow group relative flex cursor-pointer items-center gap-2 overflow-hidden border-b border-blue-200 px-3 py-2 sm:gap-3 sm:px-5 [&>*:not(.hover-overlay)]:relative [&>*:not(.hover-overlay)]:z-10 dark:border-blue-900"
      >
        {/* Hover tint as a separately-faded overlay so the change is smooth
            — CSS can't tween background-image gradients directly, but it
            can tween opacity. Semi-transparent (60%) so the flowing
            gradient underneath stays visible while hovered. Direct children
            get relative+z-10 via the arbitrary selector above so they paint
            above this overlay. */}
        <span
          aria-hidden
          className="hover-overlay pointer-events-none absolute inset-0 bg-gradient-to-r from-sky-100 via-blue-100 to-indigo-100 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-60 dark:from-sky-900 dark:via-blue-900 dark:to-indigo-900"
        />
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
        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          <span className="hidden sm:inline">Generated Query</span>
          <span className="sm:hidden">Query</span>
        </span>
        {!expanded && (
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.18em] text-blue-600/80 sm:inline dark:text-blue-300/80">
            click to expand ▾
          </span>
        )}
        {total === 0 ? (
          <span className="hidden font-mono text-[11px] text-neutral-500 sm:inline dark:text-neutral-400">empty → match_all</span>
        ) : (
          <span className="hidden items-center gap-1.5 sm:flex">
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              void copy();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:border-blue-300 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-900"
          >
            {copied ? (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12l5 5L20 7" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            )}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              exportJson();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900"
            title="Download query as .json"
            aria-label="Export query as JSON file"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              importInputRef.current?.click();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-900"
            title="Load a raw Elasticsearch query JSON — clauses become editable blocks; unrecognised shapes become custom items"
            aria-label="Import raw query JSON"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21V9" />
              <path d="M7 14l5-5 5 5" />
              <path d="M5 3h14" />
            </svg>
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importRawQuery(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      {importError && (
        <div className="flex shrink-0 items-center gap-3 border-b border-rose-300 bg-rose-50 px-5 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <span className="font-semibold">Query import error:</span>
          <span className="truncate">{importError}</span>
          <button
            onClick={() => setImportError(null)}
            className="ml-auto rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Kept mounted while collapsed — unmounting on collapse blanked the
          JSON in the same frame as the click, a one-frame snap before the
          height tween even started. As a flex-1 (basis 0) child it shrinks
          to true 0px when collapsed, so the closing panel slides over its
          content instead. Padding lives on an inner wrapper: border-box
          padding on the flex child itself would floor its height at ~24px.
          inert (string form — React 18 lacks the boolean prop) keeps the
          hidden tree's toggle buttons out of the tab order. */}
      <div
        aria-hidden={!expanded}
        {...(expanded ? {} : { inert: '' })}
        className="min-h-0 flex-1 overflow-auto bg-white dark:bg-neutral-950"
      >
        <div className="px-4 py-3">
          <JsonTree value={built} />
        </div>
      </div>
    </section>
  );
}
