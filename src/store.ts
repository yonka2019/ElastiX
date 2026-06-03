import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  BoolMode,
  BuilderItem,
  BuilderSections,
  ModeBlock,
  Template,
} from './types';
import { MODE_ORDER } from './types';

// Templates are a read-only catalog. Production loading path:
//   pod startup → entrypoint reads ConfigMap → envsubst inlines JSON into
//   index.html under <script id="elastix-templates" type="application/json">.
// The browser reads that element synchronously; no extra HTTP request.
// Dev fallback (npm run dev — no entrypoint runs): the placeholder stays
// literal, JSON.parse throws, and we fetch /templates.json from Vite's
// public/ folder.
const TEMPLATES_URL = '/templates.json';
const INLINE_ELEMENT_ID = 'elastix-templates';

function readInlineTemplates(): Template[] | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(INLINE_ELEMENT_ID);
  if (!el || !el.textContent) return null;
  try {
    const list = JSON.parse(el.textContent);
    return Array.isArray(list) ? (list as Template[]) : null;
  } catch {
    // Unsubstituted placeholder (dev) or malformed JSON — let caller fall back.
    return null;
  }
}

export type ElastixConfig = {
  kibanaUrl: string;
  indexPattern: string;
  dataViewId: string;
  ready: boolean;
};

type StoreState = {
  templates: Template[];
  blocks: ModeBlock[];
  // Instance id of the item that was just created via a palette drop, so the
  // matching row can auto-open its editor. Consumed (cleared) by the row once
  // it picks it up.
  pendingEditId: string | null;
  config: ElastixConfig;
  loadConfig: () => Promise<void>;

  // Auto doc-count preference. Shared by the QueryOutput toolbar switch and
  // the Settings panel; persisted manually to localStorage (partialize only
  // persists blocks).
  autoCount: boolean;
  setAutoCount: (v: boolean) => void;

  addBlock: (mode: BoolMode, atIndex?: number) => string;
  addNestedBlock: (parentBlockId: string, mode: BoolMode, atIndex?: number) => string | null;
  removeBlock: (blockId: string) => void;
  reorderBlocks: (fromIndex: number, toIndex: number) => void;
  // Set or clear the block's custom name (empty string clears it).
  renameBlock: (blockId: string, name: string) => void;

  addTemplateToBlock: (blockId: string, templateId: string, atIndex?: number) => string | null;
  addCustomToBlock: (
    blockId: string,
    payload: { name: string; query: Record<string, unknown> },
    atIndex?: number
  ) => string | null;
  addTimestampToBlock: (
    blockId: string,
    payload: { field: string; gte?: string; lte?: string },
    atIndex?: number
  ) => string | null;
  addTermToBlock: (
    blockId: string,
    payload: { field: string; value: string },
    atIndex?: number
  ) => string | null;
  addMatchToBlock: (
    blockId: string,
    payload: { field: string; value: string },
    atIndex?: number
  ) => string | null;
  addTermsToBlock: (
    blockId: string,
    payload: { field: string; values: string[] },
    atIndex?: number
  ) => string | null;
  addExistsToBlock: (
    blockId: string,
    payload: { field: string },
    atIndex?: number
  ) => string | null;
  addNestedBlockTopLevel: (atIndex?: number) => string;
  addNestedBlockInside: (parentBlockId: string, atIndex?: number) => string | null;
  setBlockPath: (blockId: string, path: string) => void;
  updateCustomItem: (
    instanceId: string,
    patch: { name?: string; query?: Record<string, unknown> }
  ) => void;
  updateTimestampItem: (
    instanceId: string,
    patch: { title?: string; field?: string; gte?: string; lte?: string }
  ) => void;
  updateTermItem: (instanceId: string, patch: { title?: string; field?: string; value?: string }) => void;
  updateMatchItem: (instanceId: string, patch: { title?: string; field?: string; value?: string }) => void;
  updateTermsItem: (
    instanceId: string,
    patch: { title?: string; field?: string; values?: string[] }
  ) => void;
  updateExistsItem: (instanceId: string, patch: { title?: string; field?: string }) => void;
  removeItem: (instanceId: string) => void;
  moveItemToBlock: (instanceId: string, toBlockId: string, atIndex?: number) => void;
  reorderItemInBlock: (blockId: string, fromIndex: number, toIndex: number) => void;
  promoteItemToTopLevel: (instanceId: string, atIndex?: number) => void;
  nestTopLevelBlock: (sourceBlockId: string, targetBlockId: string, atIndex?: number) => void;

  setPendingEditId: (id: string | null) => void;

  clearBuilder: () => void;
  replaceBlocks: (blocks: ModeBlock[]) => void;

  // Read-only template catalog loaded from /templates.json.
  templatesLoading: boolean;
  templatesError: string | null;
  loadTemplates: () => Promise<void>;
};

function insertAt<T>(arr: T[], item: T, index?: number): T[] {
  const next = [...arr];
  const at = index === undefined ? next.length : Math.max(0, Math.min(index, next.length));
  next.splice(at, 0, item);
  return next;
}

function mapBlock(b: ModeBlock, blockId: string, fn: (b: ModeBlock) => ModeBlock): ModeBlock {
  if (b.id === blockId) return fn(b);
  let changed = false;
  const items = b.items.map((it) => {
    if (it.source.kind !== 'bool') return it;
    const inner = mapBlock(it.source.block, blockId, fn);
    if (inner === it.source.block) return it;
    changed = true;
    return { ...it, source: { kind: 'bool' as const, block: inner } };
  });
  return changed ? { ...b, items } : b;
}

function updateBlockById(
  blocks: ModeBlock[],
  blockId: string,
  fn: (b: ModeBlock) => ModeBlock
): ModeBlock[] {
  return blocks.map((b) => mapBlock(b, blockId, fn));
}

function findBlockById(blocks: ModeBlock[], blockId: string): ModeBlock | null {
  for (const b of blocks) {
    if (b.id === blockId) return b;
    for (const it of b.items) {
      if (it.source.kind === 'bool') {
        const r = findBlockById([it.source.block], blockId);
        if (r) return r;
      }
    }
  }
  return null;
}

function locateItem(
  blocks: ModeBlock[],
  instanceId: string
): { parentBlockId: string; index: number } | null {
  for (const b of blocks) {
    const idx = b.items.findIndex((x) => x.instanceId === instanceId);
    if (idx >= 0) return { parentBlockId: b.id, index: idx };
    for (const it of b.items) {
      if (it.source.kind === 'bool') {
        const r = locateItem([it.source.block], instanceId);
        if (r) return r;
      }
    }
  }
  return null;
}

function findItem(blocks: ModeBlock[], instanceId: string): BuilderItem | null {
  const loc = locateItem(blocks, instanceId);
  if (!loc) return null;
  const b = findBlockById(blocks, loc.parentBlockId);
  return b?.items[loc.index] ?? null;
}

// Detect parent→descendant move: prevent moving a nested bool item into its own subtree.
function isDescendantBlock(item: BuilderItem, blockId: string): boolean {
  if (item.source.kind !== 'bool') return false;
  if (item.source.block.id === blockId) return true;
  return item.source.block.items.some((c) => isDescendantBlock(c, blockId));
}

const AUTO_COUNT_KEY = 'elastix-auto-count';

function readStoredAutoCount(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(AUTO_COUNT_KEY) === '1';
  } catch {
    return false;
  }
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      templates: [],
      templatesLoading: false,
      templatesError: null,
      blocks: [],
      pendingEditId: null,
      config: { kibanaUrl: '', indexPattern: '*', dataViewId: '', ready: false },
      autoCount: readStoredAutoCount(),

      setAutoCount: (v) => {
        try {
          localStorage.setItem(AUTO_COUNT_KEY, v ? '1' : '0');
        } catch {
          /* ignore */
        }
        set({ autoCount: v });
      },

      loadConfig: async () => {
        try {
          const res = await fetch('/api/config', { cache: 'no-store' });
          if (!res.ok) return;
          const cfg = (await res.json()) as Partial<ElastixConfig>;
          set({
            config: {
              kibanaUrl: cfg.kibanaUrl ?? '',
              indexPattern: cfg.indexPattern ?? '*',
              dataViewId: cfg.dataViewId ?? '',
              ready: Boolean(cfg.ready),
            },
          });
        } catch {
          // No middleware running (e.g. static prod build w/o backend) — keep defaults.
        }
      },

      addBlock: (mode, atIndex) => {
        const id = `blk-${uuidv4().slice(0, 8)}`;
        set((s) => ({
          blocks: insertAt(s.blocks, { id, mode, items: [] }, atIndex),
        }));
        return id;
      },

      addNestedBlock: (parentBlockId, mode, atIndex) => {
        const id = `blk-${uuidv4().slice(0, 8)}`;
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, parentBlockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'bool', block: { id, mode, items: [] } },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? id : null;
      },

      removeBlock: (blockId) => {
        set((s) => {
          // Remove from top-level if matched there.
          if (s.blocks.some((b) => b.id === blockId)) {
            return { blocks: s.blocks.filter((b) => b.id !== blockId) };
          }
          // Otherwise, remove the wrapping bool item from its parent.
          // Find the BuilderItem whose source.block.id === blockId, then drop it.
          const stripFromParent = (blocks: ModeBlock[]): ModeBlock[] =>
            blocks.map((b) => ({
              ...b,
              items: b.items
                .filter(
                  (it) => !(it.source.kind === 'bool' && it.source.block.id === blockId)
                )
                .map((it) =>
                  it.source.kind === 'bool'
                    ? {
                        ...it,
                        source: {
                          kind: 'bool' as const,
                          block: stripFromParent([it.source.block])[0],
                        },
                      }
                    : it
                ),
            }));
          return { blocks: stripFromParent(s.blocks) };
        });
      },

      renameBlock: (blockId, name) => {
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            const trimmed = name.trim();
            if (trimmed === (b.name ?? '')) return b;
            return trimmed ? { ...b, name: trimmed } : { ...b, name: undefined };
          }),
        }));
      },

      reorderBlocks: (fromIndex, toIndex) => {
        set((s) => {
          if (fromIndex === toIndex) return s;
          // Out-of-range indices must be a no-op: splice(badFrom, 1) removes
          // nothing and splice(to, 0, undefined) would insert a hole that
          // corrupts the tree (found by fuzzing).
          const max = s.blocks.length - 1;
          if (fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) return s;
          const arr = [...s.blocks];
          const [moved] = arr.splice(fromIndex, 1);
          arr.splice(toIndex, 0, moved);
          return { blocks: arr };
        });
      },

      addTemplateToBlock: (blockId, templateId, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'template', templateId },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addCustomToBlock: (blockId, { name, query }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'custom', name, query },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addTimestampToBlock: (blockId, { field, gte, lte }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'timestamp', field, gte, lte },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addTermToBlock: (blockId, { field, value }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'term', field, value },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addMatchToBlock: (blockId, { field, value }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'match', field, value },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addTermsToBlock: (blockId, { field, values }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'terms', field, values },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addExistsToBlock: (blockId, { field }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'exists', field },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },

      addNestedBlockTopLevel: (atIndex) => {
        const id = `blk-${uuidv4().slice(0, 8)}`;
        set((s) => ({
          blocks: insertAt(
            s.blocks,
            { id, mode: 'must', items: [], nested: { path: '' } },
            atIndex
          ),
        }));
        return id;
      },

      addNestedBlockInside: (parentBlockId, atIndex) => {
        const id = `blk-${uuidv4().slice(0, 8)}`;
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, parentBlockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: {
                kind: 'bool',
                block: { id, mode: 'must', items: [], nested: { path: '' } },
              },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? id : null;
      },

      setBlockPath: (blockId, path) => {
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            if (!b.nested) return b;
            return { ...b, nested: { path } };
          }),
        }));
      },

      updateCustomItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'custom') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'custom',
                  name: patch.name ?? existing.source.name,
                  query: patch.query ?? existing.source.query,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      updateTimestampItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'timestamp') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'timestamp',
                  title: patch.title !== undefined ? patch.title || undefined : existing.source.title,
                  field: patch.field ?? existing.source.field,
                  gte: patch.gte !== undefined ? patch.gte : existing.source.gte,
                  lte: patch.lte !== undefined ? patch.lte : existing.source.lte,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      updateTermItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'term') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'term',
                  title: patch.title !== undefined ? patch.title || undefined : existing.source.title,
                  field: patch.field ?? existing.source.field,
                  value: patch.value ?? existing.source.value,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      updateMatchItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'match') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'match',
                  title: patch.title !== undefined ? patch.title || undefined : existing.source.title,
                  field: patch.field ?? existing.source.field,
                  value: patch.value ?? existing.source.value,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      updateTermsItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'terms') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'terms',
                  title: patch.title !== undefined ? patch.title || undefined : existing.source.title,
                  field: patch.field ?? existing.source.field,
                  values: patch.values ?? existing.source.values,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      updateExistsItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'exists') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'exists',
                  title: patch.title !== undefined ? patch.title || undefined : existing.source.title,
                  field: patch.field ?? existing.source.field,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },

      setPendingEditId: (id) => set({ pendingEditId: id }),

      removeItem: (instanceId) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => ({
              ...b,
              items: b.items.filter((x) => x.instanceId !== instanceId),
            })),
          };
        });
      },

      moveItemToBlock: (instanceId, toBlockId, atIndex) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          const fromBlock = findBlockById(s.blocks, loc.parentBlockId);
          if (!fromBlock) return s;
          const item = fromBlock.items[loc.index];

          // Block can't be moved into its own subtree.
          if (isDescendantBlock(item, toBlockId)) return s;

          if (loc.parentBlockId === toBlockId) {
            return {
              blocks: updateBlockById(s.blocks, toBlockId, (b) => {
                const arr = [...b.items];
                arr.splice(loc.index, 1);
                const idx =
                  atIndex === undefined
                    ? arr.length
                    : Math.max(0, Math.min(atIndex, arr.length));
                arr.splice(idx, 0, item);
                return { ...b, items: arr };
              }),
            };
          }

          // Cross-block move: remove from source, insert into target.
          let blocks = updateBlockById(s.blocks, loc.parentBlockId, (b) => ({
            ...b,
            items: b.items.filter((x) => x.instanceId !== instanceId),
          }));
          blocks = updateBlockById(blocks, toBlockId, (b) => ({
            ...b,
            items: insertAt(b.items, item, atIndex),
          }));
          return { blocks };
        });
      },

      nestTopLevelBlock: (sourceBlockId, targetBlockId, atIndex) => {
        set((s) => {
          if (sourceBlockId === targetBlockId) return s;
          const srcIdx = s.blocks.findIndex((b) => b.id === sourceBlockId);
          if (srcIdx < 0) return s;
          const sourceBlock = s.blocks[srcIdx];

          // Cycle guard: target must not live inside the source subtree.
          if (findBlockById([sourceBlock], targetBlockId)) return s;

          const withoutSource = [...s.blocks];
          withoutSource.splice(srcIdx, 1);

          const newItem: BuilderItem = {
            instanceId: uuidv4(),
            source: { kind: 'bool', block: sourceBlock },
          };

          return {
            blocks: updateBlockById(withoutSource, targetBlockId, (b) => ({
              ...b,
              items: insertAt(b.items, newItem, atIndex),
            })),
          };
        });
      },

      promoteItemToTopLevel: (instanceId, atIndex) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          const parent = findBlockById(s.blocks, loc.parentBlockId);
          if (!parent) return s;
          const item = parent.items[loc.index];
          if (!item || item.source.kind !== 'bool') return s;

          const without = updateBlockById(s.blocks, loc.parentBlockId, (b) => ({
            ...b,
            items: b.items.filter((x) => x.instanceId !== instanceId),
          }));

          const inner = item.source.block;
          const blocks = insertAt(without, inner, atIndex);
          return { blocks };
        });
      },

      reorderItemInBlock: (blockId, fromIndex, toIndex) => {
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            if (fromIndex === toIndex) return b;
            // Same out-of-range guard as reorderBlocks — see comment there.
            const max = b.items.length - 1;
            if (fromIndex < 0 || fromIndex > max || toIndex < 0 || toIndex > max) return b;
            const arr = [...b.items];
            const [moved] = arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, moved);
            return { ...b, items: arr };
          }),
        }));
      },

      clearBuilder: () => set({ blocks: [] }),
      replaceBlocks: (blocks) => set({ blocks }),

      loadTemplates: async () => {
        set({ templatesLoading: true, templatesError: null });
        // Production / Docker / K8s: catalog is already in the DOM.
        const inline = readInlineTemplates();
        if (inline) {
          set({ templates: inline, templatesLoading: false });
          return;
        }
        // Dev fallback: Vite serves public/templates.json.
        try {
          const res = await fetch(TEMPLATES_URL, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const list = (await res.json()) as Template[];
          if (!Array.isArray(list)) throw new Error('templates.json is not an array');
          set({ templates: list, templatesLoading: false });
        } catch (err) {
          console.error('loadTemplates failed', err);
          set({
            templatesLoading: false,
            templatesError: (err as Error).message,
          });
        }
      },
    }),
    {
      name: 'eck-template-builder-v2',
      version: 7,
      // Only blocks survive a reload; templates are loaded from MongoDB on
      // mount via loadTemplates().
      partialize: (state) => ({ blocks: state.blocks }),
      migrate: (persisted: unknown, version) => {
        const state = persisted as {
          templates?: Template[];
          builder?: unknown;
          blocks?: ModeBlock[];
        } | undefined;
        if (!state) return persisted as StoreState;

        // v1 → v2: backfill `source` on each builder item.
        if (version < 2 && Array.isArray(state.builder)) {
          state.builder = (state.builder as unknown[]).map((raw) => {
            const b = raw as {
              instanceId?: string;
              templateId?: string;
              mode?: BoolMode;
              source?: BuilderItem['source'];
            };
            if (b.source) return { instanceId: b.instanceId ?? uuidv4(), mode: b.mode ?? 'must', source: b.source };
            return {
              instanceId: b.instanceId ?? uuidv4(),
              mode: b.mode ?? 'must',
              source: { kind: 'template' as const, templateId: b.templateId ?? '' },
            };
          });
        }

        // v2 → v3: bucket the flat builder array by mode.
        if (version < 3 && Array.isArray(state.builder)) {
          const grouped: BuilderSections = { must: [], filter: [], should: [], must_not: [] };
          for (const raw of state.builder as unknown[]) {
            const b = raw as { instanceId?: string; mode?: BoolMode; source?: BuilderItem['source'] };
            if (!b.source || !b.instanceId) continue;
            const m = b.mode ?? 'must';
            grouped[m].push({ instanceId: b.instanceId, source: b.source });
          }
          state.builder = grouped;
        }

        // v3 → v4: convert sections object to ordered blocks list.
        if (version < 4) {
          const blocks: ModeBlock[] = [];
          if (state.builder && !Array.isArray(state.builder)) {
            const sections = state.builder as BuilderSections;
            for (const m of MODE_ORDER) {
              if (sections[m] && sections[m].length > 0) {
                blocks.push({ id: `blk-${uuidv4().slice(0, 8)}`, mode: m, items: sections[m] });
              }
            }
          }
          state.blocks = blocks;
          delete state.builder;
        }

        if (!Array.isArray(state.blocks)) state.blocks = [];

        // v4 → v5: drop persisted templates; they now live in MongoDB and
        // are loaded at runtime via loadTemplates().
        if (version < 5) {
          delete state.templates;
        }

        // v5 → v6: an earlier iteration of the app had a leaf-style
        // 'nested' source kind that no longer exists. Strip any such
        // leftover items so the new buildQuery doesn't choke on them.
        if (version < 6 && Array.isArray(state.blocks)) {
          type AnyItem = { source?: { kind?: string; block?: unknown } };
          const stripNested = (blocks: ModeBlock[]): ModeBlock[] =>
            blocks.map((b) => ({
              ...b,
              items: b.items
                .filter((it) => (it as AnyItem).source?.kind !== 'nested')
                .map((it) => {
                  if ((it as AnyItem).source?.kind === 'bool') {
                    const inner = (it as { source: { kind: 'bool'; block: ModeBlock } }).source.block;
                    return {
                      ...it,
                      source: { kind: 'bool' as const, block: stripNested([inner])[0] },
                    };
                  }
                  return it;
                }),
            }));
          state.blocks = stripNested(state.blocks);
        }

        // v6 → v7: the dedicated 'wildcard' leaf kind was removed. Convert
        // persisted wildcard rows into equivalent custom rows so the emitted
        // query stays identical.
        if (version < 7 && Array.isArray(state.blocks)) {
          type AnyItem = { source?: { kind?: string; title?: string; field?: string; value?: string } };
          const convertWildcards = (blocks: ModeBlock[]): ModeBlock[] =>
            blocks.map((b) => ({
              ...b,
              items: b.items.map((it) => {
                const src = (it as AnyItem).source;
                if (src?.kind === 'wildcard') {
                  const field = src.field ?? '';
                  const value = src.value ?? '';
                  return {
                    ...it,
                    source: {
                      kind: 'custom' as const,
                      name: src.title || `wildcard: ${field || '?'}`,
                      query: { wildcard: { [field]: value } },
                    },
                  };
                }
                if (src?.kind === 'bool') {
                  const inner = (it as { source: { kind: 'bool'; block: ModeBlock } }).source.block;
                  return {
                    ...it,
                    source: { kind: 'bool' as const, block: convertWildcards([inner])[0] },
                  };
                }
                return it;
              }),
            }));
          state.blocks = convertWildcards(state.blocks);
        }

        return state as StoreState;
      },
    }
  )
);

export function totalItemCount(blocks: ModeBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    for (const it of b.items) {
      if (it.source.kind === 'bool') n += totalItemCount([it.source.block]);
      else n += 1;
    }
  }
  return n;
}

export function modeOccurrences(blocks: ModeBlock[]): Record<BoolMode, number> {
  const counts: Record<BoolMode, number> = { must: 0, filter: 0, should: 0, must_not: 0 };
  const walk = (bs: ModeBlock[]) => {
    for (const b of bs) {
      for (const it of b.items) {
        if (it.source.kind === 'bool') walk([it.source.block]);
        else counts[b.mode] += 1;
      }
    }
  };
  walk(blocks);
  return counts;
}

function resolveItemWithMap(
  byId: Map<string, Template>,
  item: BuilderItem
): Record<string, unknown> | undefined {
  if (item.source.kind === 'template') return byId.get(item.source.templateId)?.query;
  if (item.source.kind === 'custom') return item.source.query;
  if (item.source.kind === 'timestamp') {
    const bounds: Record<string, unknown> = {};
    if (item.source.gte) bounds.gte = item.source.gte;
    if (item.source.lte) bounds.lte = item.source.lte;
    if (Object.keys(bounds).length === 0) return undefined;
    return { range: { [item.source.field]: bounds } };
  }
  if (item.source.kind === 'term') {
    if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
    return { term: { [item.source.field]: item.source.value } };
  }
  if (item.source.kind === 'match') {
    if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
    return { match: { [item.source.field]: item.source.value } };
  }
  if (item.source.kind === 'terms') {
    const cleaned = item.source.values.map((v) => v.trim()).filter(Boolean);
    if (!item.source.field.trim() || cleaned.length === 0) return undefined;
    return { terms: { [item.source.field]: cleaned } };
  }
  if (item.source.kind === 'exists') {
    if (!item.source.field.trim()) return undefined;
    return { exists: { field: item.source.field } };
  }
  // Defensive: any unknown kind (e.g. a leftover from a previous build that
  // had a kind that no longer exists in this version) is treated as a
  // skipped clause rather than crashing.
  if (item.source.kind !== 'bool') return undefined;
  const inner = makeBoolInnerWithMap(byId, [item.source.block]);
  if (Object.keys(inner).length === 0) return undefined;
  return { bool: inner };
}

function makeBoolInnerWithMap(
  byId: Map<string, Template>,
  bs: ModeBlock[]
): Record<string, unknown> {
  const buckets: Record<BoolMode, Array<Record<string, unknown>>> = {
    must: [],
    filter: [],
    should: [],
    must_not: [],
  };
  for (const block of bs) {
    if (block.nested) {
      // Nested block: build the inner clauses as a bool of items combined
      // under the block's own mode, wrap in {nested: ...}, and contribute
      // as a single clause to the parent's mode bucket.
      const path = block.nested.path.trim();
      if (!path) continue;
      const innerClauses: Array<Record<string, unknown>> = [];
      for (const item of block.items) {
        const q = resolveItemWithMap(byId, item);
        if (q) innerClauses.push(q);
      }
      if (innerClauses.length === 0) continue;
      const innerBool = { bool: { [block.mode]: innerClauses } };
      buckets[block.mode].push({ nested: { path, query: innerBool } });
    } else {
      for (const item of block.items) {
        const q = resolveItemWithMap(byId, item);
        if (q) buckets[block.mode].push(q);
      }
    }
  }
  const out: Record<string, unknown> = {};
  for (const m of MODE_ORDER) {
    if (buckets[m].length) out[m] = buckets[m];
  }
  return out;
}

export function resolveItem(
  templates: Template[],
  item: BuilderItem
): Record<string, unknown> | undefined {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return resolveItemWithMap(byId, item);
}

export function buildBlockQuery(
  templates: Template[],
  block: ModeBlock
): Record<string, unknown> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inner = makeBoolInnerWithMap(byId, [block]);
  return { bool: inner };
}

export function buildQuery(templates: Template[], blocks: ModeBlock[]): Record<string, unknown> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inner = makeBoolInnerWithMap(byId, blocks);
  if (Object.keys(inner).length === 0) {
    return { query: { match_all: {} } };
  }
  return { query: { bool: inner } };
}

export function locateItemPublic(
  blocks: ModeBlock[],
  instanceId: string
): { parentBlockId: string; index: number } | null {
  return locateItem(blocks, instanceId);
}

export function blockContaining(blocks: ModeBlock[], instanceId: string): ModeBlock | null {
  const loc = locateItem(blocks, instanceId);
  if (!loc) return null;
  return findBlockById(blocks, loc.parentBlockId);
}

export function getItem(blocks: ModeBlock[], instanceId: string): BuilderItem | null {
  return findItem(blocks, instanceId);
}
