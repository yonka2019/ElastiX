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
    <section className="flex h-full flex-1 flex-col bg-neutral-50">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-3">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Builder</div>
          <div className="text-xs text-neutral-500">
            Drag blocks from the left palette, then drop templates under them
          </div>
        </div>
        {blocks.length > 0 && (
          <button
            onClick={() => clearBuilder()}
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:border-neutral-400 hover:bg-neutral-50"
          >
            Clear all
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-5 py-5"
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
                <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/40 px-4 py-3 text-center text-xs font-medium text-blue-700">
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
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-neutral-300 bg-white px-6 py-12 text-center">
      <div
        className={[
          'flex h-16 w-16 items-center justify-center rounded-full border-2',
          over
            ? 'border-blue-500 bg-blue-100 pulse-ring'
            : hint
            ? 'border-blue-300 bg-blue-50'
            : 'border-neutral-200 bg-neutral-50',
        ].join(' ')}
      >
        <span className={`text-2xl ${over ? 'text-blue-600' : hint ? 'text-blue-500' : 'text-neutral-400'}`}>
          ←
        </span>
      </div>
      <div className="text-lg font-semibold text-neutral-900">
        {over ? 'Release to add the block' : hint ? 'Drop here to add this block' : 'Drag a block from the left'}
      </div>
      <div className="max-w-md text-sm text-neutral-500">
        Build your query by stacking <span className="font-mono text-emerald-700">must</span>,{' '}
        <span className="font-mono text-sky-700">should</span>, and{' '}
        <span className="font-mono text-rose-700">must_not</span> blocks. Then drop templates
        from the right under each block, or write your own custom clauses inside.
      </div>
    </div>
  );
}
