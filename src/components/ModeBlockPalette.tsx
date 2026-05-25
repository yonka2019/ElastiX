import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { BoolMode } from '../types';
import { MODE_META, MODE_ORDER } from '../types';
import { ModeIcon } from './icons';

export type LeafPaletteId =
  | 'custom'
  | 'timestamp-range'
  | 'term'
  | 'match'
  | 'wildcard'
  | 'terms'
  | 'exists';

type LeafSpec =
  | {
      id: 'custom';
      kind: 'custom';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { name: string; query: Record<string, unknown> };
    }
  | {
      id: 'timestamp-range';
      kind: 'timestamp';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string; gte?: string; lte?: string };
    }
  | {
      id: 'term';
      kind: 'term';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string; value: string };
    }
  | {
      id: 'match';
      kind: 'match';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string; value: string };
    }
  | {
      id: 'wildcard';
      kind: 'wildcard';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string; value: string };
    }
  | {
      id: 'terms';
      kind: 'terms';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string; values: string[] };
    }
  | {
      id: 'exists';
      kind: 'exists';
      label: string;
      caption: string;
      glyph: ReactNode;
      accent: string;
      ring: string;
      payload: { field: string };
    };

const CustomGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M9 4c-1.5 0-2.5.7-2.5 2.5v2.4c0 1.7-1 2.6-2.5 2.6v1c1.5 0 2.5.9 2.5 2.6v2.4c0 1.8 1 2.5 2.5 2.5" />
    <path d="M15 4c1.5 0 2.5.7 2.5 2.5v2.4c0 1.7 1 2.6 2.5 2.6v1c-1.5 0-2.5.9-2.5 2.6v2.4c0 1.8-1 2.5-2.5 2.5" />
  </svg>
);

const MatchGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="11" cy="11" r="6" />
    <path d="M16 16l5 5" />
  </svg>
);

const TermGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M4 7h7" />
    <path d="M4 12h14" />
    <path d="M4 17h10" />
  </svg>
);

const TermsGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect x="3" y="5" width="8" height="3" rx="1" />
    <rect x="13" y="5" width="8" height="3" rx="1" />
    <rect x="3" y="11" width="8" height="3" rx="1" />
    <rect x="13" y="11" width="8" height="3" rx="1" />
    <rect x="3" y="17" width="8" height="3" rx="1" />
  </svg>
);

const WildcardGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 4v16" />
    <path d="M5.5 7.5l13 9" />
    <path d="M5.5 16.5l13 -9" />
  </svg>
);

const ExistsGlyph = (
  <svg
    viewBox="0 0 24 24"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const LEAF_PALETTE: LeafSpec[] = [
  {
    id: 'custom',
    kind: 'custom',
    label: 'custom',
    caption: 'free JSON clause',
    glyph: CustomGlyph,
    accent: 'text-indigo-700 dark:text-indigo-300',
    ring: 'hover:ring-indigo-200 dark:hover:ring-indigo-800',
    payload: { name: 'custom', query: { term: { field: 'value' } } },
  },
  {
    id: 'timestamp-range',
    kind: 'timestamp',
    label: 'timestamp',
    caption: 'createdAt range',
    glyph: '⏱',
    accent: 'text-amber-700 dark:text-amber-300',
    ring: 'hover:ring-amber-200 dark:hover:ring-amber-800',
    payload: { field: 'createdAt', gte: 'now-15m', lte: 'now' },
  },
  {
    id: 'term',
    kind: 'term',
    label: 'term',
    caption: 'field = value',
    glyph: TermGlyph,
    accent: 'text-purple-700 dark:text-purple-300',
    ring: 'hover:ring-purple-200 dark:hover:ring-purple-800',
    payload: { field: '', value: '' },
  },
  {
    id: 'terms',
    kind: 'terms',
    label: 'terms',
    caption: 'field IN values',
    glyph: TermsGlyph,
    accent: 'text-fuchsia-700 dark:text-fuchsia-300',
    ring: 'hover:ring-fuchsia-200 dark:hover:ring-fuchsia-800',
    payload: { field: '', values: [] },
  },
  {
    id: 'exists',
    kind: 'exists',
    label: 'exists',
    caption: 'field is present',
    glyph: ExistsGlyph,
    accent: 'text-teal-700 dark:text-teal-300',
    ring: 'hover:ring-teal-200 dark:hover:ring-teal-800',
    payload: { field: '' },
  },
  {
    id: 'match',
    kind: 'match',
    label: 'match',
    caption: 'full-text search',
    glyph: MatchGlyph,
    accent: 'text-rose-700 dark:text-rose-300',
    ring: 'hover:ring-rose-200 dark:hover:ring-rose-800',
    payload: { field: '', value: '' },
  },
  {
    id: 'wildcard',
    kind: 'wildcard',
    label: 'wildcard',
    caption: 'pattern * ?',
    glyph: WildcardGlyph,
    accent: 'text-yellow-700 dark:text-yellow-300',
    ring: 'hover:ring-yellow-200 dark:hover:ring-yellow-800',
    payload: { field: '', value: '' },
  },
];

type Props = {
  activeDragMode: BoolMode | null;
  activeDragLeaf: LeafPaletteId | null;
  activeDragNestedBlock: boolean;
  // Nested blocks are only meaningful inside a bool context, so the palette
  // card is locked until the user has at least one must/should/must_not
  // block on the canvas.
  nestedDisabled: boolean;
  // Leaf clauses can only be dropped into a block — without any blocks on
  // the canvas there's nowhere valid to drop, so the cards visually mute.
  leavesDisabled: boolean;
};

function PaletteCard({ mode, isDragging }: { mode: BoolMode; isDragging: boolean }) {
  const meta = MODE_META[mode];
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `palette-block:${mode}`,
    data: { kind: 'palette-block', mode },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group relative cursor-grab select-none overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow active:cursor-grabbing dark:border-neutral-700 dark:bg-neutral-900 ${
        isDragging ? 'opacity-30' : ''
      }`}
      title={`Drag to add a ${meta.label} block`}
    >
      <div className={`${meta.headerSolid} flex items-center gap-2 px-3 py-2 text-white`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 backdrop-blur">
          <ModeIcon mode={mode} className="h-4 w-4 text-white" />
        </span>
        <span className="font-mono text-[13px] font-bold tracking-wide">{meta.label}</span>
      </div>
    </div>
  );
}

function PaletteNestedCard({ isDragging, disabled }: { isDragging: boolean; disabled: boolean }) {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: 'palette-block:nested',
    data: { kind: 'palette-block-nested' },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      className={`group relative select-none overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition-all dark:border-neutral-700 dark:bg-neutral-900 ${
        disabled
          ? 'cursor-not-allowed opacity-50 grayscale'
          : 'cursor-grab hover:-translate-y-0.5 hover:shadow active:cursor-grabbing'
      } ${isDragging ? 'opacity-30' : ''}`}
      title={
        disabled
          ? 'Add a must / should / must_not block first — nested only makes sense inside one'
          : 'Drag to add a nested query block (path + inner items)'
      }
    >
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

function LeafCard({
  spec,
  isDragging,
  disabled,
}: {
  spec: LeafSpec;
  isDragging: boolean;
  disabled: boolean;
}) {
  const { setNodeRef, attributes, listeners } = useDraggable({
    id: `palette-leaf:${spec.id}`,
    data: {
      kind: 'palette-leaf',
      leafId: spec.id,
      leafKind: spec.kind,
      payload: spec.payload,
    },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
      className={[
        'group relative flex select-none items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm transition-all ring-2 ring-transparent dark:border-neutral-700 dark:bg-neutral-900',
        disabled
          ? 'cursor-not-allowed opacity-50 grayscale'
          : `cursor-grab hover:-translate-y-0.5 hover:shadow active:cursor-grabbing ${spec.ring}`,
        isDragging ? 'opacity-30' : '',
      ].join(' ')}
      title={
        disabled
          ? 'Add a block first — clauses can only be dropped into a block'
          : `Drag to add a ${spec.label} clause into a block`
      }
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50 font-mono text-sm dark:border-neutral-700 dark:bg-neutral-800 ${spec.accent}`}>
        {spec.glyph}
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate font-mono text-[13px] font-bold tracking-wide ${spec.accent}`}>
          {spec.label}
        </span>
        <span className="truncate text-[10px] text-neutral-500 dark:text-neutral-400">{spec.caption}</span>
      </div>
    </div>
  );
}

export function ModeBlockPalette({
  activeDragMode,
  activeDragLeaf,
  activeDragNestedBlock,
  nestedDisabled,
  leavesDisabled,
}: Props) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="border-b border-neutral-200 bg-white px-3 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Blocks</div>
        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Drag onto the builder</div>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 pb-10">
        {MODE_ORDER.map((m) => (
          <PaletteCard key={m} mode={m} isDragging={activeDragMode === m} />
        ))}
        <PaletteNestedCard isDragging={activeDragNestedBlock} disabled={nestedDisabled} />

        <div className="mt-3 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
          <span>Clauses</span>
          <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
        </div>
        {LEAF_PALETTE.map((spec) => (
          <LeafCard
            key={spec.id}
            spec={spec}
            isDragging={activeDragLeaf === spec.id}
            disabled={leavesDisabled}
          />
        ))}
      </div>
    </aside>
  );
}
