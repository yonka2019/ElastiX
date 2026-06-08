export type BoolMode = 'must' | 'filter' | 'should' | 'must_not';

export const MODE_ORDER: BoolMode[] = ['must', 'filter', 'should', 'must_not'];

export const MODE_META: Record<
  BoolMode,
  {
    label: string;
    word: string;
    sentence: string;
    dot: string;
    chip: string;
    bar: string;
    // Subdued bar shade. Used when a clause is rendered inside a block
    // that is itself nested as an item of another block — the row reads as
    // belonging to a sub-context instead of the top level.
    barSub: string;
    softBg: string;
    softBgStrong: string;
    softBorder: string;
    softRing: string;
    accentText: string;
    headerText: string;
    headerSolid: string;
    blockShadow: string;
  }
> = {
  must: {
    label: 'must',
    word: 'AND',
    sentence: 'document must match all of these clauses',
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    bar: 'bg-emerald-500',
    barSub: 'bg-emerald-300 dark:bg-emerald-700',
    softBg: 'bg-emerald-50/60 dark:bg-emerald-950/40',
    softBgStrong: 'bg-emerald-100/60 dark:bg-emerald-900/40',
    softBorder: 'border-emerald-200 dark:border-emerald-800',
    softRing: 'ring-emerald-300 dark:ring-emerald-700',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    headerText: 'text-emerald-900 dark:text-emerald-100',
    headerSolid: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
    blockShadow: 'shadow-emerald-200/40 dark:shadow-emerald-900/30',
  },
  filter: {
    label: 'filter',
    word: 'FILTER',
    sentence: 'document must match all of these — no scoring, cacheable',
    dot: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800',
    bar: 'bg-violet-500',
    barSub: 'bg-violet-300 dark:bg-violet-700',
    softBg: 'bg-violet-50/60 dark:bg-violet-950/40',
    softBgStrong: 'bg-violet-100/60 dark:bg-violet-900/40',
    softBorder: 'border-violet-200 dark:border-violet-800',
    softRing: 'ring-violet-300 dark:ring-violet-700',
    accentText: 'text-violet-700 dark:text-violet-300',
    headerText: 'text-violet-900 dark:text-violet-100',
    headerSolid: 'bg-gradient-to-r from-violet-600 to-violet-500',
    blockShadow: 'shadow-violet-200/40 dark:shadow-violet-900/30',
  },
  should: {
    label: 'should',
    word: 'OR',
    sentence: 'document matches better if any of these match',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
    bar: 'bg-sky-500',
    barSub: 'bg-sky-300 dark:bg-sky-700',
    softBg: 'bg-sky-50/60 dark:bg-sky-950/40',
    softBgStrong: 'bg-sky-100/60 dark:bg-sky-900/40',
    softBorder: 'border-sky-200 dark:border-sky-800',
    softRing: 'ring-sky-300 dark:ring-sky-700',
    accentText: 'text-sky-700 dark:text-sky-300',
    headerText: 'text-sky-900 dark:text-sky-100',
    headerSolid: 'bg-gradient-to-r from-sky-600 to-sky-500',
    blockShadow: 'shadow-sky-200/40 dark:shadow-sky-900/30',
  },
  must_not: {
    label: 'must_not',
    word: 'NOT',
    sentence: 'document must not match any of these',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
    bar: 'bg-rose-500',
    barSub: 'bg-rose-300 dark:bg-rose-700',
    softBg: 'bg-rose-50/60 dark:bg-rose-950/40',
    softBgStrong: 'bg-rose-100/60 dark:bg-rose-900/40',
    softBorder: 'border-rose-200 dark:border-rose-800',
    softRing: 'ring-rose-300 dark:ring-rose-700',
    accentText: 'text-rose-700 dark:text-rose-300',
    headerText: 'text-rose-900 dark:text-rose-100',
    headerSolid: 'bg-gradient-to-r from-rose-600 to-rose-500',
    blockShadow: 'shadow-rose-200/40 dark:shadow-rose-900/30',
  },
};

// Nested blocks have their own visual identity (orange) that does NOT depend
// on the inner bool mode. The inner mode still drives semantics — how the
// items inside combine — but it does not tint the block's outer chrome.
// Without this a nested+must block would look green, a nested+should one
// would look blue, etc., which made the nested marker ambiguous.
export const NESTED_META = {
  softBg: 'bg-orange-50/60 dark:bg-orange-950/40',
  softBgStrong: 'bg-orange-100/60 dark:bg-orange-900/40',
  softBorder: 'border-orange-200 dark:border-orange-800',
  softRing: 'ring-orange-300 dark:ring-orange-700',
  accentText: 'text-orange-700 dark:text-orange-300',
  blockShadow: 'shadow-orange-200/40 dark:shadow-orange-900/30',
} as const;

export type Template = {
  id: string;
  name: string;
  description?: string;
  query: Record<string, unknown>;
};

// All leaf clause kinds accept an optional `title` — a free-text label the
// user can attach so the row in the builder reads as something meaningful
// (e.g. "prod traffic only") instead of just the field name. Empty/undefined
// falls back to the field-based default in BuilderRow.
export type BuilderSource =
  | { kind: 'template'; templateId: string }
  | { kind: 'custom'; name: string; query: Record<string, unknown> }
  // A query fetched from the remote service (Ruletta). Like `custom` it embeds
  // its own query so it survives reloads, but it is READ-ONLY — rendered like a
  // template with no inline editor, since it represents an externally-owned
  // saved query rather than something hand-edited here.
  | { kind: 'remote'; name: string; query: Record<string, unknown> }
  | { kind: 'timestamp'; title?: string; field: string; gte?: string; lte?: string }
  // `numeric` (term/terms): see the terms comment below — numeric-looking
  // values are emitted as JSON numbers at query-build time.
  | { kind: 'term'; title?: string; field: string; value: string; numeric?: boolean }
  | { kind: 'match'; title?: string; field: string; value: string }
  // `numeric`: when set, values that look like numbers are emitted as JSON
  // numbers (123) instead of strings ("123"). Values are still stored as
  // strings; the conversion happens at query-build time (see utils/terms.ts).
  | { kind: 'terms'; title?: string; field: string; values: string[]; numeric?: boolean }
  | { kind: 'exists'; title?: string; field: string }
  | { kind: 'bool'; block: ModeBlock };

export type BuilderItem = {
  instanceId: string;
  source: BuilderSource;
  // When true, this clause is excluded from the generated query but stays in
  // the builder. Toggled per-row; absent = enabled. (Block-level disable lives
  // on ModeBlock.disabled.)
  disabled?: boolean;
};

export type BuilderSections = Record<BoolMode, BuilderItem[]>;

export const emptySections = (): BuilderSections => ({ must: [], filter: [], should: [], must_not: [] });

export type ModeBlock = {
  id: string;
  mode: BoolMode;
  items: BuilderItem[];
  // Optional user-provided name shown in the block header. Falls back to
  // MODE_META[mode].label when not set.
  name?: string;
  // When present, the block represents an Elasticsearch `nested` query.
  // The items are combined via the block's mode into an inner bool, then
  // wrapped: { nested: { path, query: { bool: ... } } }. The whole block
  // contributes as a single clause to the parent's `mode` bucket.
  nested?: { path: string };
  // When true, the block is excluded from the generated query entirely —
  // both top-level and nested. Absent = enabled. The per-block JSON preview
  // (the header eye) still shows the block's query regardless, so a disabled
  // block can be inspected. Persisted with the builder state.
  disabled?: boolean;
};
