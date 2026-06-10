import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useStore, totalItemCount } from '../store';
import { BlockCard } from './BlockCard';

type Props = {
  isDraggingTemplate: boolean;
  isDraggingPaletteBlock: boolean;
  isDraggingItem: boolean;
  isDraggingIntoBlock: boolean;
};

export function Builder({
  isDraggingTemplate,
  isDraggingPaletteBlock,
  isDraggingItem,
  isDraggingIntoBlock,
}: Props) {
  const blocks = useStore((s) => s.blocks);
  const templates = useStore((s) => s.templates);
  const clearBuilder = useStore((s) => s.clearBuilder);

  // Stable reference so memoized BlockCards don't re-render every Builder render.
  const templatesById = useMemo(
    () => new Map(templates.map((t) => [t.id, t])),
    [templates]
  );
  const total = totalItemCount(blocks);

  const { setNodeRef, isOver } = useDroppable({
    id: 'builder-canvas',
    data: { kind: 'builder-canvas' },
  });

  const empty = blocks.length === 0;

  return (
    <section className="flex flex-1 flex-col bg-neutral-50 md:min-h-0 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-3 py-2 sm:px-5 sm:py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Builder</div>
          <div className="hidden text-xs text-neutral-500 md:block dark:text-neutral-400">
            Drag blocks from the left palette, then drop templates under them
          </div>
        </div>
        {blocks.length > 0 && (
          <button
            onClick={() => clearBuilder()}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:border-rose-800 dark:hover:bg-rose-950 dark:hover:text-rose-300"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
            Clear all
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className="min-h-[40vh] px-3 py-4 pb-10 sm:px-5 sm:py-5 md:min-h-0 md:flex-1 md:overflow-y-auto"
      >
        {empty ? (
          <EmptyState
            hint={isDraggingPaletteBlock}
            over={isOver && isDraggingPaletteBlock}
          />
        ) : (
          <SortableContext
            items={blocks.map((b) => `block:${b.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-4">
              {blocks.map((b) => (
                <BlockCard
                  key={b.id}
                  block={b}
                  templatesById={templatesById}
                  isDraggingTemplate={isDraggingTemplate}
                  isDraggingItem={isDraggingItem}
                  isDraggingIntoBlock={isDraggingIntoBlock}
                />
              ))}
              {isDraggingPaletteBlock && (
                <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 px-4 py-3 text-center text-xs font-medium text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  ↓ drop here to add a new block at the end ({total} item{total === 1 ? '' : 's'} so far)
                </div>
              )}
            </div>
          </SortableContext>
        )}
      </div>
    </section>
  );
}

function EmptyState({ hint, over }: { hint: boolean; over: boolean }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-neutral-300 bg-white px-6 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
      <div
        className={[
          'echo-ring flex h-16 w-16 items-center justify-center rounded-full border-2',
          over
            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900'
            : hint
            ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800',
        ].join(' ')}
      >
        <span className={`text-2xl ${over ? 'text-blue-600 dark:text-blue-300' : hint ? 'text-blue-500 dark:text-blue-400' : 'text-neutral-400 dark:text-neutral-500'}`}>
          ←
        </span>
      </div>
      <div className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {over ? 'Release to add the block' : hint ? 'Drop here to add this block' : 'Drag a block from the left'}
      </div>
    </div>
  );
}
