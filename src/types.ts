export type BoolMode = 'must' | 'should' | 'must_not';

export const MODE_ORDER: BoolMode[] = ['must', 'should', 'must_not'];

export const MODE_META: Record<
  BoolMode,
  {
    label: string;
    word: string;
    sentence: string;
    dot: string;
    chip: string;
    bar: string;
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
    softBg: 'bg-emerald-50/60 dark:bg-emerald-950/40',
    softBgStrong: 'bg-emerald-100/60 dark:bg-emerald-900/40',
    softBorder: 'border-emerald-200 dark:border-emerald-800',
    softRing: 'ring-emerald-300 dark:ring-emerald-700',
    accentText: 'text-emerald-700 dark:text-emerald-300',
    headerText: 'text-emerald-900 dark:text-emerald-100',
    headerSolid: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
    blockShadow: 'shadow-emerald-200/40',
  },
  should: {
    label: 'should',
    word: 'OR',
    sentence: 'document matches better if any of these match',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
    bar: 'bg-sky-500',
    softBg: 'bg-sky-50/60 dark:bg-sky-950/40',
    softBgStrong: 'bg-sky-100/60 dark:bg-sky-900/40',
    softBorder: 'border-sky-200 dark:border-sky-800',
    softRing: 'ring-sky-300 dark:ring-sky-700',
    accentText: 'text-sky-700 dark:text-sky-300',
    headerText: 'text-sky-900 dark:text-sky-100',
    headerSolid: 'bg-gradient-to-r from-sky-600 to-sky-500',
    blockShadow: 'shadow-sky-200/40',
  },
  must_not: {
    label: 'must_not',
    word: 'NOT',
    sentence: 'document must not match any of these',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800',
    bar: 'bg-rose-500',
    softBg: 'bg-rose-50/60 dark:bg-rose-950/40',
    softBgStrong: 'bg-rose-100/60 dark:bg-rose-900/40',
    softBorder: 'border-rose-200 dark:border-rose-800',
    softRing: 'ring-rose-300 dark:ring-rose-700',
    accentText: 'text-rose-700 dark:text-rose-300',
    headerText: 'text-rose-900 dark:text-rose-100',
    headerSolid: 'bg-gradient-to-r from-rose-600 to-rose-500',
    blockShadow: 'shadow-rose-200/40',
  },
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  query: Record<string, unknown>;
};

export type BuilderSource =
  | { kind: 'template'; templateId: string }
  | { kind: 'custom'; name: string; query: Record<string, unknown> }
  | { kind: 'timestamp'; field: string; gte?: string; lte?: string }
  | { kind: 'term'; field: string; value: string }
  | { kind: 'match'; field: string; value: string }
  | { kind: 'terms'; field: string; values: string[] }
  | { kind: 'exists'; field: string }
  | { kind: 'bool'; block: ModeBlock };

export type BuilderItem = {
  instanceId: string;
  source: BuilderSource;
};

export type BuilderSections = Record<BoolMode, BuilderItem[]>;

export const emptySections = (): BuilderSections => ({ must: [], should: [], must_not: [] });

export type ModeBlock = {
  id: string;
  mode: BoolMode;
  items: BuilderItem[];
  // Optional user-provided name shown in the block header. Falls back to
  // MODE_META[mode].label when not set.
  name?: string;
};
