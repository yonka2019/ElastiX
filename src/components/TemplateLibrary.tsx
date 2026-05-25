import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { TemplateCard } from './TemplateCard';
import type { Template } from '../types';

type Props = {
  activeDragId: string | null;
  // Templates can only be dropped into blocks — when there are no blocks,
  // dragging does nothing useful, so the cards visually mute.
  dragDisabled: boolean;
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
      className={
        disabled
          ? 'cursor-not-allowed opacity-70 saturate-50'
          : 'cursor-grab active:cursor-grabbing'
      }
      title={disabled ? 'Add a block first — templates drop into blocks' : undefined}
    >
      <TemplateCard template={template} variant="library" dragging={isDragging} />
    </div>
  );
}

export function TemplateLibrary({ activeDragId, dragDisabled }: Props) {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const templatesLoading = useStore((s) => s.templatesLoading);
  const templatesError = useStore((s) => s.templatesError);
  const [query, setQuery] = useState('');

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
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Templates</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Catalog from <span className="font-mono">/templates.json</span> — drag onto the builder
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
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-10">
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
    </aside>
  );
}
