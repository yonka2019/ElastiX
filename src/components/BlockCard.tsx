import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ModeBlock, Template } from '../types';
import { MODE_META } from '../types';
import { useStore, buildBlockQuery } from '../store';
import { BuilderRow } from './BuilderRow';
import { ModeIcon } from './icons';
import { usePreview } from '../utils/preview';

type Props = {
  block: ModeBlock;
  templatesById: Map<string, Template>;
  isDraggingTemplate: boolean;
  isDraggingItem: boolean;
  // True while any "drop INTO a block" drag is active (palette block/leaf or
  // template). Computed once per drag-start in App and threaded down as a
  // prop instead of read via useDndContext — useDndContext would re-render
  // every BlockCard on every pointer move, which made dragging laggy.
  isDraggingIntoBlock: boolean;
  // When set, this block is nested under a parent block as a BuilderItem (kind: 'bool').
  // The wrapper participates in the parent's SortableContext as an item.
  nested?: {
    instanceId: string;
    parentMode: ModeBlock['mode'];
  };
};

function BlockCardImpl({
  block,
  templatesById,
  isDraggingTemplate,
  isDraggingItem,
  isDraggingIntoBlock,
  nested,
}: Props) {
  const meta = MODE_META[block.mode];
  const removeItem = useStore((s) => s.removeItem);
  const removeBlock = useStore((s) => s.removeBlock);
  const renameBlock = useStore((s) => s.renameBlock);
  const setBlockPath = useStore((s) => s.setBlockPath);
  const templates = useStore((s) => s.templates);
  const { open: openPreview } = usePreview();
  const isNested = block.nested !== undefined;
  const headerGradient = isNested
    ? 'bg-gradient-to-r from-orange-600 to-orange-500'
    : meta.headerSolid;

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(block.name ?? '');
  const [collapsed, setCollapsed] = useState(false);
  // Nested blocks default to label "nested" instead of the underlying bool
  // mode so the user immediately sees what they dropped.
  const defaultLabel = block.nested ? 'nested' : meta.label;
  const displayName = block.name?.trim() || defaultLabel;

  const commitName = () => {
    renameBlock(block.id, draftName);
    setRenaming(false);
  };
  const startRename = () => {
    setDraftName(block.name ?? '');
    setRenaming(true);
  };

  // For top-level blocks: sortable id is `block:${id}`, data is kind 'block'.
  // For nested blocks: sortable id is `item:${instanceId}`, data is kind 'item' so it
  // participates in the parent block's SortableContext alongside leaf items.
  const sortable = useSortable(
    nested
      ? {
          id: `item:${nested.instanceId}`,
          data: { kind: 'item', instanceId: nested.instanceId, sectionMode: nested.parentMode },
        }
      : {
          id: `block:${block.id}`,
          data: { kind: 'block', blockId: block.id, mode: block.mode },
        }
  );
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver: isOverSortable } = sortable;

  // Inner drop zone for templates / items.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `block-zone:${block.id}`,
    data: { kind: 'block-zone', blockId: block.id, mode: block.mode },
  });

  // When the cursor is over THIS block's outer sortable (the header / edges)
  // during a "drop INTO" drag — palette block, palette leaf, or template —
  // the block is the active drop target but the body isn't highlighted.
  // Flag it so we can ring the whole card + show a header hint.
  const targetedFromHeader = isOverSortable && isDraggingIntoBlock && !isOver;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const empty = block.items.length === 0;
  // Any "drop INTO a block" drag should pulse the body hint, not only template/item drags.
  const isDragIntoBlockActive =
    isDraggingTemplate || isDraggingItem || isDraggingIntoBlock;
  const showsHint = isDragIntoBlockActive && !isOver;
  // Auto-expand while any drag is active so the user can drop into a
  // collapsed block without first un-collapsing it.
  const bodyVisible = !collapsed || isDragIntoBlockActive;

  const onRemove = () => {
    if (nested) removeItem(nested.instanceId);
    else removeBlock(block.id);
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={[
        'relative overflow-hidden rounded-xl bg-white shadow-md transition-colors dark:bg-neutral-900',
        meta.blockShadow,
        'border-2',
        targetedFromHeader
          ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
          : 'border-neutral-200 dark:border-neutral-800',
      ].join(' ')}
    >
      {targetedFromHeader && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"
        />
      )}
      {/* Block header — colored (orange for nested), with drag handle and remove */}
      <header className={`${headerGradient} flex select-none flex-col gap-1 px-4 py-3 text-white`}>
      <div className="flex items-center gap-3">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab select-none rounded p-1 text-white/70 hover:bg-white/20 hover:text-white active:cursor-grabbing"
          title={nested ? 'Drag to reorder or move this nested block' : 'Drag to reorder this block'}
        >
          ⋮⋮
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed((v) => !v);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded p-1 text-white/70 hover:bg-white/20 hover:text-white"
          title={collapsed ? 'Expand block' : 'Collapse block'}
          aria-label={collapsed ? 'Expand block' : 'Collapse block'}
          aria-expanded={!collapsed}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur">
          {isNested ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <rect x="8" y="8" width="11" height="11" rx="1.5" />
            </svg>
          ) : (
            <ModeIcon mode={block.mode} className="h-4 w-4 text-white" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {renaming ? (
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                placeholder={meta.label}
                className="min-w-0 max-w-[260px] flex-1 rounded border border-white/40 bg-white/10 px-1.5 py-0.5 font-mono text-sm font-bold tracking-wide text-white placeholder-white/60 focus:border-white focus:outline-none"
                spellCheck={false}
              />
            ) : (
              <button
                onClick={startRename}
                title="Click to rename this block"
                className="group/rename inline-flex items-center gap-1 truncate rounded px-1 font-mono text-sm font-bold tracking-wide text-white hover:bg-white/10"
              >
                <span className="truncate">{displayName}</span>
                <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/rename:opacity-80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            )}
            {block.name && (
              <span
                className="rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/90"
                title={`bool mode: ${meta.label}`}
              >
                {meta.label}
              </span>
            )}
            {nested && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/90">
                nested
              </span>
            )}
          </div>
        </div>
        {targetedFromHeader && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/25 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white shadow-sm backdrop-blur">
            ↳ drop into {displayName}
          </span>
        )}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openPreview(displayName, buildBlockQuery(templates, block));
          }}
          className="rounded p-1 text-white/70 hover:bg-white/20 hover:text-white"
          title="Show full JSON for this block"
          aria-label="Show full block JSON"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-mono text-[11px] font-semibold backdrop-blur">
          {block.items.length} {block.items.length === 1 ? 'item' : 'items'}
        </span>
        <button
          onClick={onRemove}
          className="rounded p-1 text-white/70 hover:bg-white/20 hover:text-white"
          title="Remove block"
        >
          ×
        </button>
        </div>
        {isNested && block.nested && (
          <div className="flex items-center gap-2 pl-1 text-[12px]">
            <span className="font-mono text-white/80">path:</span>
            <input
              value={block.nested.path}
              onChange={(e) => setBlockPath(block.id, e.target.value)}
              placeholder="comments"
              spellCheck={false}
              className="min-w-0 flex-1 rounded border border-white/40 bg-white/10 px-1.5 py-0.5 font-mono text-[12px] text-white placeholder-white/60 focus:border-white focus:outline-none"
            />
          </div>
        )}
      </header>

      {/* Block body with drop zone. Hidden when collapsed unless a drag is
          active (auto-expand) — the dropzone needs to be in the DOM tree
          for dnd-kit to register it as a target. */}
      <div
        ref={setDropRef}
        hidden={!bodyVisible}
        className={[
          'relative transition-colors',
          isOver ? meta.softBgStrong : meta.softBg,
        ].join(' ')}
      >
        {isOver && (
          <span
            className={`pointer-events-none absolute inset-0 ring-2 ring-inset ${meta.softRing}`}
            aria-hidden
          />
        )}
        <div className="px-4 py-3">
          {empty ? (
            <div
              className={[
                'flex items-center justify-center rounded-md border-2 border-dashed bg-white/60 px-3 py-7 text-center text-xs transition-all dark:bg-neutral-900/60',
                isOver
                  ? `${meta.softBorder} ${meta.accentText} font-semibold`
                  : showsHint
                  ? `${meta.softBorder} ${meta.accentText}`
                  : 'border-neutral-200 text-neutral-400 dark:border-neutral-700 dark:text-neutral-500',
              ].join(' ')}
            >
              {isOver
                ? `release to put under ${displayName}`
                : showsHint
                ? `drop here to put under ${displayName}`
                : `nothing under ${displayName} yet — drop a template from the right or a clause from the left`}
            </div>
          ) : (
            <SortableContext
              items={block.items.map((b) => `item:${b.instanceId}`)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {block.items.map((item, idx) =>
                  item.source.kind === 'bool' ? (
                    <BlockCard
                      key={item.instanceId}
                      block={item.source.block}
                      templatesById={templatesById}
                      isDraggingTemplate={isDraggingTemplate}
                      isDraggingItem={isDraggingItem}
                      isDraggingIntoBlock={isDraggingIntoBlock}
                      nested={{ instanceId: item.instanceId, parentMode: block.mode }}
                    />
                  ) : (
                    <BuilderRow
                      key={item.instanceId}
                      item={item}
                      sectionMode={block.mode}
                      index={idx}
                      templatesById={templatesById}
                      onRemove={() => removeItem(item.instanceId)}
                    />
                  )
                )}
              </div>
              {/* Keep the hint MOUNTED for the entire drag and only toggle
                  visibility — unmounting it on isOver was a feedback loop:
                  cursor over hint → isOver=true → hint unmounted → block-zone
                  shrinks by ~32px → cursor now outside block-zone → isOver=
                  false → hint remounted → block-zone grows back → cursor
                  inside again. The user perceived this as the focus jittering
                  rapidly between this box and the next one. */}
              {isDragIntoBlockActive && (
                <div
                  className={[
                    'mt-2 rounded-md border border-dashed bg-white/60 px-3 py-1.5 text-center text-[11px] dark:bg-neutral-900/60',
                    meta.softBorder,
                    meta.accentText,
                    isOver ? 'invisible' : '',
                  ].join(' ')}
                >
                  ↓ drop under {displayName}
                </div>
              )}
            </SortableContext>
          )}
        </div>
      </div>
    </section>
  );
}

// Default shallow comparison: sibling blocks share the same templatesById/Map
// reference (rebuilt only when templates change), and unaffected blocks keep
// their object reference across store updates, so re-renders are scoped to
// the block that actually changed.
export const BlockCard = memo(BlockCardImpl);
