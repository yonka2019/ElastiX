import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import { TemplateCard } from './TemplateCard';
import { usePreview } from '../utils/preview';
import type { Template } from '../types';

type Props = {
  // `tpl:<id>` while a catalog template is dragging, `fetched:<id>` while a
  // remote-fetched card is dragging — used to mute the source card.
  activeDragId: string | null;
  // Templates / fetched queries can only be dropped into blocks — when there
  // are no blocks, dragging does nothing useful, so the cards visually mute.
  dragDisabled: boolean;
};

// A query pulled from the remote service. Session-only — it lives in this
// component's local state and is gone on reload. When dropped into a block it
// becomes a self-contained, read-only `remote` clause, which DOES persist, so
// nothing is lost by not persisting this list itself.
type FetchedQuery = {
  id: string;
  name: string;
  query: Record<string, unknown>;
};

function LibraryItem({
  template,
  isDragging,
  disabled,
}: {
  template: Template;
  isDragging: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `tpl:${template.id}`,
    data: { kind: 'template', templateId: template.id },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      className={`select-none ${
        disabled
          ? 'cursor-not-allowed opacity-50 grayscale'
          : 'cursor-grab active:cursor-grabbing'
      }`}
      title={disabled ? 'Add a block first — templates drop into blocks' : undefined}
    >
      <TemplateCard template={template} variant="library" dragging={isDragging} />
    </div>
  );
}

// A remote-fetched query rendered as a draggable card. Distinct purple
// styling + a globe glyph set it apart from catalog templates, plus a remove
// (×) since the list is editable/session-only. Drags like a regular template
// (drops into a block) — there it becomes a read-only `remote` clause.
function FetchedItem({
  item,
  serviceName,
  isDragging,
  disabled,
  onRemove,
}: {
  item: FetchedQuery;
  serviceName: string;
  isDragging: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { open } = usePreview();
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `fetched:${item.id}`,
    data: { kind: 'fetched', id: item.id, name: item.name, query: item.query },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      className={`select-none ${
        disabled
          ? 'cursor-not-allowed opacity-50 grayscale'
          : 'cursor-grab active:cursor-grabbing'
      }`}
      title={disabled ? 'Add a block first — drop fetched queries into a block' : undefined}
    >
      <div
        className={[
          'group relative rounded-md border bg-white px-3 py-2.5 transition-shadow dark:bg-neutral-900',
          'border-purple-200 dark:border-purple-800',
          isDragging ? 'opacity-40' : 'hover:border-purple-400 hover:shadow-sm dark:hover:border-purple-600',
        ].join(' ')}
      >
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18" />
            <path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" />
          </svg>
          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {item.name}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                open(item.name, item.query);
              }}
              className="rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Show full JSON"
              aria-label="Show full JSON"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:text-neutral-500 dark:hover:bg-rose-950 dark:hover:text-rose-400"
              title="Remove fetched query"
              aria-label="Remove fetched query"
            >
              ×
            </button>
          </div>
        </div>
        <div className="mt-0.5 text-xs text-purple-600/80 dark:text-purple-400/80">from {serviceName}</div>
      </div>
    </div>
  );
}

export function TemplateLibrary({ activeDragId, dragDisabled }: Props) {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const templatesLoading = useStore((s) => s.templatesLoading);
  const templatesError = useStore((s) => s.templatesError);
  // Runtime flags from /api/config.
  const templatesRemoteReady = useStore((s) => s.config.templatesRemote);
  const templatesRemoteName = useStore((s) => s.config.templatesRemoteName);
  const remoteName = (templatesRemoteName || '').trim() || 'remote';
  const [query, setQuery] = useState('');

  // Remote-fetch state.
  const [fetched, setFetched] = useState<FetchedQuery[]>([]);
  const [promptOpen, setPromptOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const doFetch = async () => {
    const name = nameInput.trim();
    if (!name || !templatesRemoteReady || fetching) return;
    setFetching(true);
    setFetchError(null);
    try {
      // Server-side proxy (see server/templatesRemoteApi.js) — it fetches
      // ${TEMPLATES_REMOTE_URL}/<name> and returns the JSON untouched.
      const res = await fetch(`/api/templates-remote?name=${encodeURIComponent(name)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const errBody = (await res.json()) as { error?: string };
          if (errBody?.error) msg = errBody.error;
        } catch {
          /* non-JSON error body — keep the status message */
        }
        throw new Error(msg);
      }
      const body = (await res.json()) as unknown;
      // Expected shape: { query: { ... } }. Unwrap and validate.
      const inner =
        body && typeof body === 'object' && !Array.isArray(body)
          ? (body as Record<string, unknown>).query
          : undefined;
      if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
        throw new Error('Response has no "query" object');
      }
      const queryObj = inner as Record<string, unknown>;
      // Re-fetching the same name replaces the existing card rather than
      // piling up duplicates.
      setFetched((prev) => {
        const existing = prev.find((f) => f.name === name);
        const entry: FetchedQuery = { id: existing?.id ?? uuidv4(), name, query: queryObj };
        return existing ? prev.map((f) => (f.name === name ? entry : f)) : [entry, ...prev];
      });
      setNameInput('');
      setPromptOpen(false);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      if ((t.description ?? '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [templates, query]);

  return (
    <aside className="enter enter-d3 flex w-full shrink-0 flex-col border-t border-neutral-200 bg-white md:h-full md:w-80 md:border-t-0 md:border-l dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Templates</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Catalog from <span className="font-mono">MongoDB</span> — drag onto the builder
        </div>
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            spellCheck={false}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-3 pb-10 md:flex-1 md:overflow-y-auto">
        {templatesError && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <div className="font-semibold">Couldn't load templates.json</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-rose-600/80 dark:text-rose-400/80">{templatesError}</div>
            <button
              onClick={() => void loadTemplates()}
              className="mt-1.5 rounded border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-neutral-900 dark:text-rose-300 dark:hover:bg-rose-950"
            >
              Retry
            </button>
          </div>
        )}
        {templatesLoading && templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No templates in the catalog.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No templates match "{query}".
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((t) => (
              <LibraryItem
                key={t.id}
                template={t}
                isDragging={activeDragId === `tpl:${t.id}`}
                disabled={dragDisabled}
              />
            ))}
          </div>
        )}
      </div>

      {/* Remote fetch — pinned at the BOTTOM: fetched results stack above the
          button so a returned query appears right next to where you triggered it.
          Extra bottom padding clears the fixed "by yonka" corner credit. */}
      <div className="shrink-0 border-t border-neutral-200 px-3 pt-3 pb-12 dark:border-neutral-800">
        {fetched.length > 0 && (
          <div className="mb-2 max-h-44 overflow-y-auto pr-0.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              Fetched
              <span className="rounded-full bg-purple-100 px-1.5 py-px font-mono text-[9px] text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                {fetched.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {fetched.map((f) => (
                <FetchedItem
                  key={f.id}
                  item={f}
                  serviceName={remoteName}
                  isDragging={activeDragId === `fetched:${f.id}`}
                  disabled={dragDisabled}
                  onRemove={() => setFetched((prev) => prev.filter((x) => x.id !== f.id))}
                />
              ))}
            </div>
          </div>
        )}

        {!promptOpen ? (
          <button
            type="button"
            onClick={() => {
              setPromptOpen(true);
              setFetchError(null);
            }}
            disabled={!templatesRemoteReady}
            title={
              templatesRemoteReady
                ? `Fetch a query from ${remoteName} by its name`
                : 'Set TEMPLATES_REMOTE_URL on the server to enable'
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-purple-700 to-purple-500 px-3 py-2 text-xs font-semibold text-white shadow-sm shadow-purple-500/20 ring-1 ring-inset ring-white/15 transition-all duration-200 hover:-translate-y-px hover:from-purple-600 hover:to-purple-400 hover:shadow hover:shadow-purple-500/30 active:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none disabled:ring-0 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500"
          >
            {/* cloud-download — "pull a query down from the remote" */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 13v8" />
              <path d="m8 17 4 4 4-4" />
              <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
            </svg>
            Fetch from {remoteName}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doFetch();
            }}
            className="rounded-md border border-purple-300 bg-purple-50/60 p-2 dark:border-purple-800 dark:bg-purple-950/40"
          >
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPromptOpen(false);
                  setFetchError(null);
                }
              }}
              placeholder="query name…"
              spellCheck={false}
              disabled={fetching}
              className="w-full rounded border border-purple-300 bg-white px-2 py-1 font-mono text-xs focus:border-purple-500 focus:outline-none disabled:opacity-60 dark:border-purple-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="mt-1.5 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPromptOpen(false);
                  setFetchError(null);
                }}
                className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!nameInput.trim() || fetching}
                className="rounded bg-purple-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-purple-300 dark:disabled:bg-purple-900 dark:disabled:text-purple-700"
              >
                {fetching ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
            {fetchError && (
              <div className="mt-1.5 truncate font-mono text-[10px] text-rose-600 dark:text-rose-400" title={fetchError}>
                {fetchError}
              </div>
            )}
          </form>
        )}
      </div>
    </aside>
  );
}
