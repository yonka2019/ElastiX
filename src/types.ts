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
    chip: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
    softBg: 'bg-emerald-50/60',
    softBgStrong: 'bg-emerald-100/60',
    softBorder: 'border-emerald-200',
    softRing: 'ring-emerald-300',
    accentText: 'text-emerald-700',
    headerText: 'text-emerald-900',
    headerSolid: 'bg-gradient-to-r from-emerald-600 to-emerald-500',
    blockShadow: 'shadow-emerald-200/40',
  },
  should: {
    label: 'should',
    word: 'OR',
    sentence: 'document matches better if any of these match',
    dot: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 border-sky-200',
    bar: 'bg-sky-500',
    softBg: 'bg-sky-50/60',
    softBgStrong: 'bg-sky-100/60',
    softBorder: 'border-sky-200',
    softRing: 'ring-sky-300',
    accentText: 'text-sky-700',
    headerText: 'text-sky-900',
    headerSolid: 'bg-gradient-to-r from-sky-600 to-sky-500',
    blockShadow: 'shadow-sky-200/40',
  },
  must_not: {
    label: 'must_not',
    word: 'NOT',
    sentence: 'document must not match any of these',
    dot: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-700 border-rose-200',
    bar: 'bg-rose-500',
    softBg: 'bg-rose-50/60',
    softBgStrong: 'bg-rose-100/60',
    softBorder: 'border-rose-200',
    softRing: 'ring-rose-300',
    accentText: 'text-rose-700',
    headerText: 'text-rose-900',
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
