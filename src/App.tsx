import { useEffect, useRef, useState } from 'react';
import pkg from '../package.json';
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  UniqueIdentifier,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useStore, locateItemPublic, blockContaining, getItem, buildQuery } from './store';
import { titleSlug } from './utils/ids';
import { ModeBlockPalette, LEAF_PALETTE } from './components/ModeBlockPalette';
import { ElastixLogo, ModeIcon } from './components/icons';
import { TemplateLibrary } from './components/TemplateLibrary';
import { Builder } from './components/Builder';
import { QueryOutput } from './components/QueryOutput';
import { Settings } from './components/Settings';
import { CountDocs } from './components/CountDocs';
import type { BoolMode, ModeBlock } from './types';
import { MODE_META } from './types';
import { PreviewProvider } from './utils/preview';
import { buildDiscoverUrl, buildDevToolsUrl } from './utils/kibana';

type PaletteLeafDrag =
  | {
      kind: 'palette-leaf';
      leafId: 'custom';
      leafKind: 'custom';
      payload: { name: string; query: Record<string, unknown> };
    }
  | {
      kind: 'palette-leaf';
      leafId: 'timestamp-range';
      leafKind: 'timestamp';
      payload: { field: string; gte?: string; lte?: string };
    }
  | {
      kind: 'palette-leaf';
      leafId: 'term';
      leafKind: 'term';
      payload: { field: string; value: string };
    }
  | {
      kind: 'palette-leaf';
      leafId: 'terms';
      leafKind: 'terms';
      payload: { field: string; values: string[] };
    }
  | {
      kind: 'palette-leaf';
      leafId: 'exists';
      leafKind: 'exists';
      payload: { field: string };
    };

type ActiveDrag =
  | { kind: 'palette-block'; mode: BoolMode }
  | { kind: 'palette-block-nested' }
  | PaletteLeafDrag
  | { kind: 'block'; blockId: string; mode: BoolMode }
  | { kind: 'template'; templateId: string }
  // A query pulled from the remote service (TemplateLibrary). Carries its own
  // name + query so the drop handler can add it as a self-contained custom
  // clause without any catalog lookup.
  | { kind: 'fetched'; id: string; name: string; query: Record<string, unknown> }
  | { kind: 'item'; instanceId: string; sectionMode: BoolMode }
  | null;

export default function App() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const addBlock = useStore((s) => s.addBlock);
  const addNestedBlock = useStore((s) => s.addNestedBlock);
  const reorderBlocks = useStore((s) => s.reorderBlocks);
  const addTemplateToBlock = useStore((s) => s.addTemplateToBlock);
  const addCustomToBlock = useStore((s) => s.addCustomToBlock);
  const addRemoteToBlock = useStore((s) => s.addRemoteToBlock);
  const addTimestampToBlock = useStore((s) => s.addTimestampToBlock);
  const addTermToBlock = useStore((s) => s.addTermToBlock);
  const addTermsToBlock = useStore((s) => s.addTermsToBlock);
  const addExistsToBlock = useStore((s) => s.addExistsToBlock);
  const addNestedBlockTopLevel = useStore((s) => s.addNestedBlockTopLevel);
  const addNestedBlockInside = useStore((s) => s.addNestedBlockInside);
  const setPendingEditId = useStore((s) => s.setPendingEditId);
  const moveItemToBlock = useStore((s) => s.moveItemToBlock);
  const reorderItemInBlock = useStore((s) => s.reorderItemInBlock);
  const promoteItemToTopLevel = useStore((s) => s.promoteItemToTopLevel);
  const nestTopLevelBlock = useStore((s) => s.nestTopLevelBlock);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const loadConfig = useStore((s) => s.loadConfig);

  // Hydrate templates from /api/templates once on mount.
  useEffect(() => {
    void loadTemplates();
    void loadConfig();
  }, [loadTemplates, loadConfig]);

  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  // Sticky over-target so the cursor sitting near a nested block's top edge
  // doesn't flip-flop the highlight between the outer block-zone and the
  // inner bool-item with every pixel of mouse jitter. See collisionDetection.
  const lastOverIdRef = useRef<UniqueIdentifier | null>(null);
  // Entering: must be this far INSIDE a new candidate to switch off the
  // previous target. Leaving: must be this far OUTSIDE the previous target
  // (vertically, past the gap-4 = 16px between sibling top-level blocks)
  // before releasing the stick. The leaving threshold is generous on purpose
  // — the visible gap area is sticky in its entirety so the over doesn't
  // flicker between block-zone and builder-canvas when the cursor rests in
  // the gap.
  const ENTER_HYSTERESIS_PX = 8;
  const LEAVE_HYSTERESIS_PX = 24;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Touch needs a small press delay so vertical scrolling on mobile isn't
    // hijacked by accidental drag activations. 180ms with a 6px tolerance is
    // the sweet spot — short enough to feel responsive, long enough that a
    // flick-scroll on a palette card scrolls instead of grabbing.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    })
  );

  // Prefer pointer-within so nesting only happens when the cursor is actually
  // inside a block-zone. closestCenter would always pick the geometrically
  // nearest block (its center beats the huge canvas's center), causing a
  // palette drop on empty canvas to nest into a neighbouring block.
  // Fall back to rectIntersection so sortable item reordering still works in
  // the small gaps between items.
  //
  // For "drop INTO a block" drags (palette-block, palette-leaf, template),
  // we always collapse to ONE target each frame: an inner item if directly
  // hovered, else the innermost block-zone, else the block. Without this,
  // pointerWithin returns both the block sortable and its child block-zone
  // every frame, and the over-target flicks between them — making the
  // sibling blocks vibrate as the SortableContext repeatedly thinks the
  // dragged thing is "swapping" with the block.
  // Not memoized — DndContext calls this inline in its render path and does
  // not use referential equality, so re-creating each render is free. Avoiding
  // useCallback also lets HMR pick up edits to this body without a full reload
  // (an empty deps array would keep the cached closure indefinitely).
  const collisionDetection: CollisionDetection = (args) => {
    const hits = pointerWithin(args);
    if (hits.length === 0) {
      lastOverIdRef.current = null;
      return rectIntersection(args);
    }

    const activeKind = (args.active.data.current as { kind?: string } | undefined)?.kind;

    // palette-block-nested behaves like a generic "drop INTO a block" drag:
    // hovering over a block-zone or an item nests the new nested-block INSIDE
    // that block; hovering over a block header inserts it as a sibling just
    // below; hovering over the canvas appends at top level.
    if (activeKind === 'palette-block-nested') {
      const kindOf = (h: (typeof hits)[number]): string | undefined =>
        (h.data?.droppableContainer.data.current as { kind?: string } | undefined)?.kind;
      const areaOf = (h: (typeof hits)[number]): number => {
        const r = h.data?.droppableContainer.rect.current;
        return r ? r.width * r.height : Number.POSITIVE_INFINITY;
      };
      let best: (typeof hits)[number] | null = null;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const h of hits) {
        const k = kindOf(h);
        if (k !== 'item' && k !== 'block-zone') continue;
        const a = areaOf(h);
        if (a < bestArea) {
          best = h;
          bestArea = a;
        }
      }
      if (best) {
        lastOverIdRef.current = best.id;
        return [best];
      }
      const block = hits.find((h) => kindOf(h) === 'block');
      if (block) {
        lastOverIdRef.current = block.id;
        return [block];
      }
      const canvas = hits.find((h) => kindOf(h) === 'builder-canvas');
      if (canvas) {
        lastOverIdRef.current = canvas.id;
        return [canvas];
      }
      lastOverIdRef.current = null;
      return rectIntersection(args);
    }

    // Item and existing-block drags belong here too. For items: dropping on
    // another block's header would otherwise let the canvas win the hit
    // ordering and the handler would promote-to-top-level instead of re-
    // parenting. For existing top-level blocks dropped on another block's
    // BODY, the wrapping block sortable (kind: 'block') would otherwise
    // tie with the body's block-zone (kind: 'block-zone'); without
    // preferring the smaller block-zone, the handler reorders the top-
    // level blocks instead of nesting one inside the other.
    const dropIntoBlock =
      activeKind === 'palette-block' ||
      activeKind === 'palette-leaf' ||
      activeKind === 'template' ||
      activeKind === 'fetched' ||
      activeKind === 'item' ||
      activeKind === 'block';

    if (dropIntoBlock) {
      const kindOf = (h: (typeof hits)[number]): string | undefined =>
        (h.data?.droppableContainer.data.current as { kind?: string } | undefined)?.kind;
      const areaOf = (h: (typeof hits)[number]): number => {
        const r = h.data?.droppableContainer.rect.current;
        return r ? r.width * r.height : Number.POSITIVE_INFINITY;
      };

      // Pick the smallest-area hit among items and block-zones. Smallest area
      // is unambiguously the most-specific drop target geometrically — a
      // block-zone always has a smaller rect than its wrapping bool-item, and
      // a doubly-nested block-zone is smaller still.
      let best: (typeof hits)[number] | null = null;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const h of hits) {
        const k = kindOf(h);
        if (k !== 'item' && k !== 'block-zone') continue;
        const a = areaOf(h);
        if (a < bestArea) {
          best = h;
          bestArea = a;
        }
      }

      // Hysteresis: if the previously chosen target is still under the cursor
      // and the new "best" candidate is different, only switch when the cursor
      // is sufficiently INSIDE the new candidate. Without this, sub-pixel
      // mouse jitter at the top edge of a nested block flips the over between
      // the outer block-zone and the inner bool-item every frame — the
      // highlight ring, accent line, and body bg all flicker (the "vibration"
      // the user sees).
      if (best && lastOverIdRef.current != null && lastOverIdRef.current !== best.id) {
        const lastHit = hits.find((h) => h.id === lastOverIdRef.current);
        if (lastHit) {
          const r = best.data?.droppableContainer.rect.current;
          const p = args.pointerCoordinates;
          if (r && p) {
            const inset = Math.min(
              p.x - r.left,
              r.right - p.x,
              p.y - r.top,
              r.bottom - p.y
            );
            if (inset < ENTER_HYSTERESIS_PX) {
              return [lastHit];
            }
          }
        }
      }

      if (best) {
        lastOverIdRef.current = best.id;
        return [best];
      }

      // Symmetric hysteresis on the LEAVING direction. The check above sticks
      // to the previous target when ENTERING a new block-zone/item; this
      // sticks when the pointer has slipped OUT of one but is still within
      // LEAVE_HYSTERESIS_PX of its rect. Without this, hovering in the gap
      // between top-level blocks flips the over between block-zone
      // (softBgStrong + ring) and builder-canvas (blue bg) every frame.
      // 24px > gap-4 (16px) so the entire visible gap is sticky; the user
      // has to move clearly past the gap area to switch to builder-canvas.
      if (lastOverIdRef.current != null && args.pointerCoordinates) {
        const prev = args.droppableContainers.find(
          (c) => c.id === lastOverIdRef.current
        );
        const prevKind = (prev?.data.current as { kind?: string } | undefined)?.kind;
        if (prev && (prevKind === 'item' || prevKind === 'block-zone')) {
          const r = prev.rect.current;
          const p = args.pointerCoordinates;
          if (r) {
            const dx = Math.max(r.left - p.x, 0, p.x - r.right);
            const dy = Math.max(r.top - p.y, 0, p.y - r.bottom);
            if (Math.hypot(dx, dy) < LEAVE_HYSTERESIS_PX) {
              return [{ id: prev.id, data: { droppableContainer: prev, value: 0 } }];
            }
          }
        }
      }

      const block = hits.find((h) => kindOf(h) === 'block');
      if (block) {
        lastOverIdRef.current = block.id;
        return [block];
      }

      const canvas = hits.find((h) => kindOf(h) === 'builder-canvas');
      if (canvas) {
        lastOverIdRef.current = canvas.id;
        return [canvas];
      }
    }

    return hits;
  };

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ActiveDrag;
    if (!data) return;
    lastOverIdRef.current = null;
    setActiveDrag(data);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDrag(null);
    lastOverIdRef.current = null;
    if (!over) return;

    const activeData = active.data.current as
      | { kind: 'palette-block'; mode: BoolMode }
      | { kind: 'palette-block-nested' }
      | PaletteLeafDrag
      | { kind: 'block'; blockId: string; mode: BoolMode }
      | { kind: 'template'; templateId: string }
      | { kind: 'fetched'; id: string; name: string; query: Record<string, unknown> }
      | { kind: 'item'; instanceId: string; sectionMode: BoolMode }
      | undefined;
    const overData = over.data.current as
      | { kind: 'builder-canvas' }
      | { kind: 'block'; blockId: string; mode: BoolMode }
      | { kind: 'block-zone'; blockId: string; mode: BoolMode }
      | { kind: 'item'; instanceId: string; sectionMode: BoolMode }
      | undefined;
    if (!activeData || !overData) return;

    // Palette nested block:
    //   - Drop on a block's BODY (block-zone) → nest INSIDE that block.
    //   - Drop on an item — if that item is itself a bool wrapper, nest
    //     INSIDE its inner block; otherwise nest into the containing block
    //     at the item's index.
    //   - Drop on a block HEADER → insert as a top-level sibling just below.
    //   - Drop on canvas → append at top level.
    if (activeData.kind === 'palette-block-nested') {
      if (overData.kind === 'block-zone') {
        addNestedBlockInside(overData.blockId);
        return;
      }
      if (overData.kind === 'item') {
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool') {
          addNestedBlockInside(item.source.block.id);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          addNestedBlockInside(containing.id, loc?.index);
        }
        return;
      }
      let atIndex: number | undefined;
      if (overData.kind === 'block') {
        const idx = blocks.findIndex((b) => b.id === overData.blockId);
        if (idx >= 0) atIndex = idx + 1;
      }
      addNestedBlockTopLevel(atIndex);
      return;
    }

    // 1) Palette mode-block → builder.
    //    - Onto canvas: append as a new top-level block.
    //    - Onto a block's HEADER (over kind === 'block'): insert as a new
    //      top-level block just below the targeted block. This is what the
    //      user expects when they release the drag pointing at an existing
    //      block — "put a new one here".
    //    - Onto a block's BODY (block-zone) or an item inside it: nest
    //      INSIDE that block at the appropriate position.
    if (activeData.kind === 'palette-block') {
      if (overData.kind === 'builder-canvas') {
        addBlock(activeData.mode);
        return;
      }
      if (overData.kind === 'block') {
        const idx = blocks.findIndex((b) => b.id === overData.blockId);
        addBlock(activeData.mode, idx >= 0 ? idx + 1 : undefined);
        return;
      }
      if (overData.kind === 'block-zone') {
        addNestedBlock(overData.blockId, activeData.mode);
        return;
      }
      if (overData.kind === 'item') {
        // If the over item is itself a nested block (bool wrapper), nest INSIDE
        // it — same intent as dropping on the body. Only fall back to
        // "insert at this leaf's index in parent" when the over is a real leaf.
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool') {
          addNestedBlock(item.source.block.id, activeData.mode);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          addNestedBlock(containing.id, activeData.mode, loc?.index);
        }
      }
      return;
    }

    // 2) Existing block → reorder at top level (drop on another block's
    //    header) or nest into another block (drop on its body / on an
    //    item inside it).
    if (activeData.kind === 'block') {
      // Dropping on empty canvas space moves the block to the end of the
      // list (was a silent no-op — found by the drag-matrix audit).
      if (overData.kind === 'builder-canvas') {
        const from = blocks.findIndex((b) => b.id === activeData.blockId);
        if (from >= 0 && from !== blocks.length - 1) {
          reorderBlocks(from, blocks.length - 1);
        }
        return;
      }
      if (overData.kind === 'block') {
        const from = blocks.findIndex((b) => b.id === activeData.blockId);
        const to = blocks.findIndex((b) => b.id === overData.blockId);
        if (from >= 0 && to >= 0 && from !== to) reorderBlocks(from, to);
        return;
      }
      if (overData.kind === 'block-zone') {
        if (activeData.blockId !== overData.blockId) {
          nestTopLevelBlock(activeData.blockId, overData.blockId);
        }
        return;
      }
      if (overData.kind === 'item') {
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool' && item.source.block.id !== activeData.blockId) {
          nestTopLevelBlock(activeData.blockId, item.source.block.id);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing && containing.id !== activeData.blockId) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          nestTopLevelBlock(activeData.blockId, containing.id, loc?.index);
        }
      }
      return;
    }

    // 3) Palette leaf clause (custom / timestamp range) → drop into a block.
    //    Only meaningful inside a bool container, so canvas drops are ignored.
    //    After insertion we flag the new instance for auto-open so the row
    //    enters edit mode immediately.
    if (activeData.kind === 'palette-leaf') {
      const addAt = (blockId: string, atIndex?: number): string | null => {
        if (activeData.leafKind === 'timestamp') {
          return addTimestampToBlock(blockId, activeData.payload, atIndex);
        }
        if (activeData.leafKind === 'term') {
          return addTermToBlock(blockId, activeData.payload, atIndex);
        }
        if (activeData.leafKind === 'terms') {
          return addTermsToBlock(blockId, activeData.payload, atIndex);
        }
        if (activeData.leafKind === 'exists') {
          return addExistsToBlock(blockId, activeData.payload, atIndex);
        }
        return addCustomToBlock(blockId, activeData.payload, atIndex);
      };
      if (overData.kind === 'block-zone' || overData.kind === 'block') {
        const id = addAt(overData.blockId);
        if (id) setPendingEditId(id);
        return;
      }
      if (overData.kind === 'item') {
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool') {
          const id = addAt(item.source.block.id);
          if (id) setPendingEditId(id);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          const id = addAt(containing.id, loc?.index);
          if (id) setPendingEditId(id);
        }
      }
      return;
    }

    // 4) Template from library → drop into a specific block.
    if (activeData.kind === 'template') {
      if (overData.kind === 'block-zone' || overData.kind === 'block') {
        addTemplateToBlock(overData.blockId, activeData.templateId);
        return;
      }
      if (overData.kind === 'item') {
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool') {
          addTemplateToBlock(item.source.block.id, activeData.templateId);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          addTemplateToBlock(containing.id, activeData.templateId, loc?.index);
        }
      }
      return;
    }

    // 4b) Fetched remote query → drop into a block as a self-contained custom
    //     clause. Mirrors the template branch but embeds name + query, so it
    //     survives reloads (no dependency on a session-only catalog entry).
    if (activeData.kind === 'fetched') {
      const payload = { name: activeData.name, query: activeData.query };
      if (overData.kind === 'block-zone' || overData.kind === 'block') {
        addRemoteToBlock(overData.blockId, payload);
        return;
      }
      if (overData.kind === 'item') {
        const item = getItem(blocks, overData.instanceId);
        if (item?.source.kind === 'bool') {
          addRemoteToBlock(item.source.block.id, payload);
          return;
        }
        const containing = blockContaining(blocks, overData.instanceId);
        if (containing) {
          const loc = locateItemPublic(blocks, overData.instanceId);
          addRemoteToBlock(containing.id, payload, loc?.index);
        }
      }
      return;
    }

    // 4) Item drag — reorder within block, or move to another block (any depth).
    if (activeData.kind === 'item') {
      // Dropping a nested bool item on the empty canvas promotes it to a
      // new top-level block (preserving its items and name). Leaf items
      // have no meaning at the top level so we ignore them.
      if (overData.kind === 'builder-canvas') {
        const item = getItem(blocks, activeData.instanceId);
        if (item?.source.kind === 'bool') {
          promoteItemToTopLevel(activeData.instanceId);
        }
        return;
      }
      if (overData.kind === 'item') {
        if (activeData.instanceId === overData.instanceId) return;
        const src = locateItemPublic(blocks, activeData.instanceId);
        const dst = locateItemPublic(blocks, overData.instanceId);
        if (!src || !dst) return;
        if (src.parentBlockId === dst.parentBlockId) {
          if (src.index !== dst.index) {
            reorderItemInBlock(src.parentBlockId, src.index, dst.index);
          }
        } else {
          moveItemToBlock(activeData.instanceId, dst.parentBlockId, dst.index);
        }
        return;
      }
      if (overData.kind === 'block-zone' || overData.kind === 'block') {
        const containing = blockContaining(blocks, activeData.instanceId);
        if (containing && containing.id === overData.blockId) {
          // Dropped on the SAME parent. For a nested-bool item this is the
          // user trying to drag it out — promote it to top-level right
          // after the (former) parent. For a leaf, no-op.
          const item = getItem(blocks, activeData.instanceId);
          if (item?.source.kind === 'bool') {
            const idx = blocks.findIndex((b) => b.id === containing.id);
            promoteItemToTopLevel(
              activeData.instanceId,
              idx >= 0 ? idx + 1 : undefined
            );
          }
          return;
        }
        if (!containing || containing.id !== overData.blockId) {
          moveItemToBlock(activeData.instanceId, overData.blockId);
        }
      }
    }
  }

  // Overlay content
  const overlayContent = (() => {
    if (!activeDrag) return null;
    if (activeDrag.kind === 'template') {
      const t = templates.find((x) => x.id === activeDrag.templateId);
      if (!t) return null;
      return (
        <div className="max-w-[260px] truncate rounded-full border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 shadow-xl ring-2 ring-blue-200 dark:border-blue-800 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-blue-800">
          {t.name}
        </div>
      );
    }
    if (activeDrag.kind === 'fetched') {
      return (
        <div className="max-w-[260px] truncate rounded-full border border-purple-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-900 shadow-xl ring-2 ring-purple-200 dark:border-purple-700 dark:bg-neutral-900 dark:text-neutral-100 dark:ring-purple-800">
          {activeDrag.name}
        </div>
      );
    }
    if (activeDrag.kind === 'palette-leaf') {
      const spec = LEAF_PALETTE.find((s) => s.id === activeDrag.leafId);
      if (!spec) return null;
      let detail = '';
      if (activeDrag.leafKind === 'timestamp') {
        detail = `${activeDrag.payload.gte ?? '…'} → ${activeDrag.payload.lte ?? '…'}`;
      } else if (activeDrag.leafKind === 'custom') {
        detail = activeDrag.payload.name;
      } else if (activeDrag.leafKind === 'term') {
        detail = activeDrag.payload.field || 'configure…';
      } else if (activeDrag.leafKind === 'terms') {
        detail = activeDrag.payload.field || 'configure…';
      } else if (activeDrag.leafKind === 'exists') {
        detail = activeDrag.payload.field || 'configure…';
      }
      return (
        <div className="flex w-72 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-800 ${spec.accent}`}>
            {spec.glyph}
          </span>
          <span className={`font-mono text-[13px] font-bold tracking-wide ${spec.accent}`}>
            {spec.label}
          </span>
          <span className="ml-auto truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
            {detail}
          </span>
        </div>
      );
    }
    if (activeDrag.kind === 'palette-block') {
      const meta = MODE_META[activeDrag.mode];
      return (
        <div className="w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800">
          <div className={`${meta.headerSolid} flex items-center gap-2 px-3 py-2 text-white`}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <ModeIcon mode={activeDrag.mode} className="h-4 w-4 text-white" />
            </span>
            <span className="font-mono text-[13px] font-bold tracking-wide">{meta.label}</span>
          </div>
        </div>
      );
    }
    if (activeDrag.kind === 'palette-block-nested') {
      return (
        <div className="w-52 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800">
          <div className="flex items-center gap-2 bg-gradient-to-r from-orange-600 to-orange-500 px-3 py-2 text-white">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <rect x="8" y="8" width="11" height="11" rx="1.5" />
              </svg>
            </span>
            <span className="font-mono text-[13px] font-bold tracking-wide">nested</span>
          </div>
        </div>
      );
    }
    if (activeDrag.kind === 'item') {
      const item = getItem(blocks, activeDrag.instanceId);
      if (!item) return null;
      const sectionMeta = MODE_META[activeDrag.sectionMode];
      if (item.source.kind === 'bool') {
        const inner = item.source.block;
        const blockMeta = MODE_META[inner.mode];
        const isNestedBlock = inner.nested !== undefined;
        const headerGradient = isNestedBlock
          ? 'bg-gradient-to-r from-orange-600 to-orange-500'
          : blockMeta.headerSolid;
        const label = inner.name?.trim() || (isNestedBlock ? 'nested' : blockMeta.label);
        return (
          <div className="w-[420px] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800">
            <div className={`${headerGradient} flex items-center gap-2 px-3 py-2 text-white`}>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                {isNestedBlock ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <rect x="8" y="8" width="11" height="11" rx="1.5" />
                  </svg>
                ) : (
                  <ModeIcon mode={inner.mode} className="h-4 w-4 text-white" />
                )}
              </span>
              <span className="font-mono text-[13px] font-bold tracking-wide">{label}</span>
              <span className="ml-auto font-mono text-[11px] text-white/80">
                {inner.items.length} item{inner.items.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        );
      }
      let name: string;
      if (item.source.kind === 'template') {
        const { templateId } = item.source;
        name = templates.find((t) => t.id === templateId)?.name ?? 'unknown';
      } else if (item.source.kind === 'custom' || item.source.kind === 'remote') {
        name = item.source.name;
      } else if (item.source.kind === 'timestamp') {
        name = item.source.title || `${item.source.field} range`;
      } else {
        // term / match / terms / exists — same label fallback as BuilderRow.
        name = item.source.title || item.source.field || '(unset)';
      }
      return (
        <div className="flex w-[420px] items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2.5 shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800">
          <span className={`h-2 w-2 rounded-full ${sectionMeta.dot}`} />
          <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{name}</span>
          <span className={`ml-auto font-mono text-[10px] ${sectionMeta.accentText}`}>
            from {sectionMeta.label}
          </span>
        </div>
      );
    }
    if (activeDrag.kind === 'block') {
      const block = blocks.find((b) => b.id === activeDrag.blockId);
      if (!block) return null;
      const meta = MODE_META[block.mode];
      const isNestedBlock = block.nested !== undefined;
      const headerGradient = isNestedBlock
        ? 'bg-gradient-to-r from-orange-600 to-orange-500'
        : meta.headerSolid;
      const label = block.name?.trim() || (isNestedBlock ? 'nested' : meta.label);
      return (
        <div className={`w-72 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl ring-2 ring-blue-200 dark:border-neutral-700 dark:bg-neutral-900 dark:ring-blue-800`}>
          <div className={`${headerGradient} flex items-center gap-2 px-3 py-2 text-white`}>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              {isNestedBlock ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <rect x="8" y="8" width="11" height="11" rx="1.5" />
                </svg>
              ) : (
                <ModeIcon mode={block.mode} className="h-4 w-4 text-white" />
              )}
            </span>
            <span className="font-mono text-[13px] font-bold tracking-wide">{label}</span>
            <span className="ml-auto font-mono text-[11px] text-white/80">
              {block.items.length} item{block.items.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      );
    }
    return null;
  })();

  return (
    <PreviewProvider>
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDrag(null);
        lastOverIdRef.current = null;
      }}
    >
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        <Header />
        {/*
          Mobile (<md): the main area becomes a single vertical scroll
          container. Palette, Builder, Templates stack top-to-bottom; each
          side rail caps at ~40vh so the Builder always stays prominent.
          Stacking (rather than tabs) keeps every drop target reachable
          during a drag — @dnd-kit autoscrolls the outer container.
          md+: classic 3-column flex row, each column scrolls on its own.
        */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <ModeBlockPalette
            activeDragMode={activeDrag?.kind === 'palette-block' ? activeDrag.mode : null}
            activeDragLeaf={activeDrag?.kind === 'palette-leaf' ? activeDrag.leafId : null}
            activeDragNestedBlock={activeDrag?.kind === 'palette-block-nested'}
            nestedDisabled={!blocks.some((b) => !b.nested)}
            leavesDisabled={blocks.length === 0}
          />
          <div className="enter enter-d2 flex min-w-0 flex-1 flex-col md:min-h-0">
            <QueryOutput />
            <Builder
              isDraggingTemplate={activeDrag?.kind === 'template'}
              isDraggingPaletteBlock={activeDrag?.kind === 'palette-block'}
              isDraggingItem={activeDrag?.kind === 'item'}
              isDraggingIntoBlock={
                activeDrag?.kind === 'palette-block' ||
                activeDrag?.kind === 'palette-leaf' ||
                activeDrag?.kind === 'palette-block-nested' ||
                activeDrag?.kind === 'template' ||
                activeDrag?.kind === 'fetched'
              }
            />
          </div>
          <TemplateLibrary
            activeDragId={
              activeDrag?.kind === 'template'
                ? `tpl:${activeDrag.templateId}`
                : activeDrag?.kind === 'fetched'
                ? `fetched:${activeDrag.id}`
                : null
            }
            dragDisabled={blocks.length === 0}
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-2 left-3 z-40 font-mono text-[10px] tracking-wider text-neutral-500 dark:text-neutral-400"
        >
          <span className="rounded border border-neutral-300 px-1.5 py-0.5 dark:border-neutral-700">
            v{pkg.version}
          </span>
        </div>
        <div
          aria-hidden
          className="pointer-events-none fixed bottom-2 right-3 z-40 font-mono text-[11px] font-semibold tracking-wider"
        >
          {/* The whole "by yonka" is one hover target and one animated unit —
              hovering anywhere on it wiggles the full text (see .yonka-corner
              in index.css). Pointer events are re-enabled only on the text
              itself so the rest of the corner stays click-through. */}
          <span className="yonka-corner pointer-events-auto relative inline-block cursor-default">
            <span className="yonka-word">
              <RainbowText text="by " />
              <RainbowText text="yonka" startIndex={2} />
            </span>
          </span>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.7,.2,1)' }}>
        {overlayContent}
      </DragOverlay>
    </DndContext>
    </PreviewProvider>
  );
}

/**
 * Renders `text` one letter at a time, each cycling through the spectrum via
 * the `.rainbow-text` keyframes. A per-letter negative `animation-delay`
 * offsets each character's phase so the colours read as a wave travelling
 * across the word rather than the whole thing flashing in unison. Spaces are
 * rendered as non-animated gaps. Decorative only — callers mark aria-hidden
 * or supply accessible text elsewhere.
 */
function RainbowText({
  text,
  className = '',
  step = 0.45,
  startIndex = 0,
}: {
  text: string;
  className?: string;
  step?: number;
  // Phase offset (in letters) so a wave can continue across separate
  // RainbowText spans, e.g. "by " + a hoverable "yonka".
  startIndex?: number;
}) {
  let letter = startIndex;
  return (
    <>
      {[...text].map((ch, i) =>
        ch === ' ' ? (
          <span key={i}>&nbsp;</span>
        ) : (
          <span
            key={i}
            className={`rainbow-text ${className}`}
            style={{ animationDelay: `${-(letter++) * step}s` }}
          >
            {ch}
          </span>
        ),
      )}
    </>
  );
}

function Header() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const config = useStore((s) => s.config);
  const replaceBlocks = useStore((s) => s.replaceBlocks);
  const queryTitle = useStore((s) => s.queryTitle);
  const setQueryTitle = useStore((s) => s.setQueryTitle);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ioError, setIoError] = useState<string | null>(null);

  // Mirror the query title into the browser tab so a named query is
  // recognisable among multiple ElastiX tabs.
  useEffect(() => {
    const t = queryTitle.trim();
    document.title = t ? `${t} · ElastiX` : 'ElastiX';
  }, [queryTitle]);

  const openInKibana = () => {
    if (!config.kibanaUrl) return;
    const built = buildQuery(templates, blocks) as { query?: Record<string, unknown> };
    const inner = built.query ?? { match_all: {} };
    // With a data view UUID we can open Discover with the query applied; without
    // one Discover has no data view to bind the query to, so fall back to the
    // Dev Tools console (the original behaviour).
    const url = config.dataViewId
      ? buildDiscoverUrl(config.kibanaUrl, config.dataViewId, inner)
      : buildDevToolsUrl(config.kibanaUrl, config.indexPattern, inner);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const exportState = () => {
    const payload = {
      kind: 'elastix-state' as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      title: queryTitle.trim(),
      blocks,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    const slug = titleSlug(queryTitle);
    a.href = url;
    a.download = `elastix-state-${slug ? `${slug}-` : ''}${date}.elastix`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importState = async (file: File) => {
    setIoError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { kind?: string; blocks?: unknown; title?: unknown };
      if (data.kind !== 'elastix-state') {
        setIoError('File is not an ElastiX state export. To import a raw query JSON, use the Import button next to "Generated Query" → Export.');
        return;
      }
      if (!Array.isArray(data.blocks)) {
        setIoError('Export is malformed: "blocks" must be an array.');
        return;
      }
      if (blocks.length > 0) {
        const ok = window.confirm(
          'Replace the current builder with imported state? Your current blocks will be lost.'
        );
        if (!ok) return;
      }
      replaceBlocks(data.blocks as ModeBlock[]);
      // Pre-title exports have no `title` — clear the current one so the
      // imported state fully replaces what was on screen.
      setQueryTitle(typeof data.title === 'string' ? data.title : '');
    } catch (err) {
      setIoError(`Failed to import: ${(err as Error).message}`);
    }
  };

  return (
    <>
      <header className="enter relative flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 sm:gap-3 sm:px-5 sm:py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <span
          aria-hidden
          className="rainbow-line absolute inset-x-0 top-0 h-[5px]"
        />
        <ElastixLogo className="elastix-logo-animated h-6 w-6 sm:h-7 sm:w-7" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-semibold text-neutral-900 dark:text-neutral-100">ElastiX</span>
        </div>
        <span aria-hidden className="mx-0.5 hidden h-5 w-px bg-neutral-200 sm:inline-block dark:bg-neutral-700" />
        {/* Whole-query title. Free text, persisted with the builder state,
            stamped into .elastix exports and download filenames, mirrored
            into the tab title. A faint resting border marks it as editable;
            hover deepens it, focus goes blue. */}
        <input
          value={queryTitle}
          onChange={(e) => setQueryTitle(e.target.value)}
          onKeyDown={(e) => {
            // Enter commits: the value is already in the store (saved per
            // keystroke), so "save" = leave edit mode by dropping focus.
            if (e.key === 'Enter' || e.key === 'Escape') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Untitled query"
          spellCheck={false}
          aria-label="Query title"
          title="Name this query — saved with exports and used in download filenames"
          className="min-w-0 max-w-xs flex-1 rounded-md border border-neutral-200 bg-transparent px-2 py-1 text-sm font-medium text-neutral-800 transition-colors placeholder:text-neutral-400 hover:border-neutral-300 focus:border-blue-300 focus:bg-white focus:outline-none dark:border-neutral-700/60 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:hover:border-neutral-600 dark:focus:border-blue-700 dark:focus:bg-neutral-950"
        />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={exportState}
            disabled={blocks.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:disabled:text-neutral-500"
            title="Download the current builder state as an .elastix file"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            title="Load builder state from an .elastix file"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 21V9" />
              <path d="M7 14l5-5 5 5" />
              <path d="M5 3h14" />
            </svg>
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".elastix"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importState(f);
              e.target.value = '';
            }}
          />
          {/* Divider between builder-state I/O and the Elastic actions. */}
          <span aria-hidden className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-neutral-700" />
          <CountDocs />
          <button
            onClick={openInKibana}
            disabled={!config.kibanaUrl}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white dark:border-emerald-800 dark:bg-neutral-900 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950 dark:disabled:border-neutral-700 dark:disabled:text-neutral-500 dark:disabled:hover:bg-neutral-900"
            title={
              config.kibanaUrl
                ? `Open this query in ${config.kibanaUrl}`
                : 'Set KIBANA_URL in .env to enable'
            }
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-label="Elastic" role="img">
              <rect x="3" y="3.5" width="9" height="4" rx="1.5" fill="#FED10A" />
              <rect x="13" y="3.5" width="8" height="4" rx="1.5" fill="#00BFB3" />
              <rect x="3" y="10" width="13" height="4" rx="1.5" fill="#1BA9F5" />
              <rect x="17" y="10" width="4" height="4" rx="1.5" fill="#F04E98" />
              <rect x="3" y="16.5" width="9" height="4" rx="1.5" fill="#0A5BB0" />
              <rect x="13" y="16.5" width="8" height="4" rx="1.5" fill="#FA744E" />
            </svg>
            <span className="hidden sm:inline">Open in Kibana</span>
          </button>
          <Settings />
        </div>
      </header>
      {ioError && (
        <div className="flex shrink-0 items-center gap-3 border-b border-rose-300 bg-rose-50 px-5 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <span className="font-semibold">Import error:</span>
          <span className="truncate">{ioError}</span>
          <button
            onClick={() => setIoError(null)}
            className="ml-auto rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
