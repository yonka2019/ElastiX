import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BoolMode, BuilderItem, Template } from '../types';
import { MODE_META } from '../types';
import { useStore } from '../store';
import { CustomBlockForm } from './CustomBlockForm';
import { TimestampRangeForm } from './TimestampRangeForm';
import { TermForm } from './TermForm';
import { MatchForm } from './MatchForm';
import { TermsForm } from './TermsForm';
import { ExistsForm } from './ExistsForm';

type Props = {
  // Leaf items only (template/custom/timestamp/term/terms/exists). Bool items
  // are rendered as BlockCard by the parent.
  item: BuilderItem;
  sectionMode: BoolMode;
  templatesById: Map<string, Template>;
  index: number;
  onRemove: () => void;
};

export function BuilderRow({ item, sectionMode, templatesById, index, onRemove }: Props) {
  const updateCustomItem = useStore((s) => s.updateCustomItem);
  const updateTimestampItem = useStore((s) => s.updateTimestampItem);
  const updateTermItem = useStore((s) => s.updateTermItem);
  const updateMatchItem = useStore((s) => s.updateMatchItem);
  const updateTermsItem = useStore((s) => s.updateTermsItem);
  const updateExistsItem = useStore((s) => s.updateExistsItem);
  const pendingEditId = useStore((s) => s.pendingEditId);
  const setPendingEditId = useStore((s) => s.setPendingEditId);
  const meta = MODE_META[sectionMode];

  const [editing, setEditing] = useState(false);

  // Auto-open editor when this item was just created via a palette drop.
  useEffect(() => {
    if (pendingEditId && pendingEditId === item.instanceId) {
      setEditing(true);
      setPendingEditId(null);
    }
  }, [pendingEditId, item.instanceId, setPendingEditId]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `item:${item.instanceId}`,
    data: { kind: 'item', instanceId: item.instanceId, sectionMode },
    disabled: editing,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Bool items are rendered as BlockCard by the parent; this row is leaf-only.
  if (item.source.kind === 'bool') return null;

  // Inline edit forms.
  if (editing && item.source.kind === 'custom') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <CustomBlockForm
          variant="edit"
          sectionMode={sectionMode}
          initialName={item.source.name}
          initialQuery={item.source.query}
          onSubmit={({ name, query }) => {
            updateCustomItem(item.instanceId, { name, query });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  if (editing && item.source.kind === 'timestamp') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <TimestampRangeForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          initialGte={item.source.gte}
          initialLte={item.source.lte}
          onSubmit={(patch) => {
            updateTimestampItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  if (editing && item.source.kind === 'term') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <TermForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          initialValue={item.source.value}
          onSubmit={(patch) => {
            updateTermItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  if (editing && item.source.kind === 'match') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <MatchForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          initialValue={item.source.value}
          onSubmit={(patch) => {
            updateMatchItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  if (editing && item.source.kind === 'terms') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <TermsForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          initialValues={item.source.values}
          onSubmit={(patch) => {
            updateTermsItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
  if (editing && item.source.kind === 'exists') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <ExistsForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          onSubmit={(patch) => {
            updateExistsItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // --- Display mode ---
  const isCustom = item.source.kind === 'custom';
  const isTimestamp = item.source.kind === 'timestamp';
  const isTemplate = item.source.kind === 'template';
  const isTerm = item.source.kind === 'term';
  const isMatch = item.source.kind === 'match';
  const isTerms = item.source.kind === 'terms';
  const isExists = item.source.kind === 'exists';
  const editable = isCustom || isTimestamp || isTerm || isMatch || isTerms || isExists;

  let label: string;
  let description: string | undefined;
  let queryPreview: string;
  let missing = false;

  if (item.source.kind === 'template') {
    const t = templatesById.get(item.source.templateId);
    if (!t) {
      missing = true;
      label = '— missing template —';
      queryPreview = '';
    } else {
      label = t.name;
      description = t.description;
      queryPreview = JSON.stringify(t.query);
    }
  } else if (item.source.kind === 'custom') {
    label = item.source.name;
    queryPreview = JSON.stringify(item.source.query);
  } else if (item.source.kind === 'timestamp') {
    label = `${item.source.field} range`;
    const gte = item.source.gte ?? '…';
    const lte = item.source.lte ?? '…';
    description = `${gte} → ${lte}`;
    queryPreview = JSON.stringify({
      range: {
        [item.source.field]: {
          ...(item.source.gte ? { gte: item.source.gte } : {}),
          ...(item.source.lte ? { lte: item.source.lte } : {}),
        },
      },
    });
  } else if (item.source.kind === 'term') {
    label = item.source.field || '(unset)';
    description = item.source.value ? `= ${item.source.value}` : 'no value';
    queryPreview = JSON.stringify({ term: { [item.source.field || '_field']: item.source.value } });
  } else if (item.source.kind === 'match') {
    label = item.source.field || '(unset)';
    description = item.source.value ? `~ ${item.source.value}` : 'no value';
    queryPreview = JSON.stringify({ match: { [item.source.field || '_field']: item.source.value } });
  } else if (item.source.kind === 'terms') {
    label = item.source.field || '(unset)';
    description =
      item.source.values.length > 0 ? `IN (${item.source.values.join(', ')})` : 'no values';
    queryPreview = JSON.stringify({ terms: { [item.source.field || '_field']: item.source.values } });
  } else {
    // exists
    label = item.source.field || '(unset)';
    description = 'must be present';
    queryPreview = JSON.stringify({ exists: { field: item.source.field } });
  }

  if (missing) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center gap-3 rounded-md border border-dashed border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
      >
        <span className="font-mono text-xs">{String(index + 1).padStart(2, '0')}</span>
        <span>{label}</span>
        <button onClick={onRemove} className="ml-auto text-xs hover:underline">
          remove
        </button>
      </div>
    );
  }

  const editLabel = isTimestamp
    ? 'Configure range'
    : isTerm
    ? 'Configure term'
    : isMatch
    ? 'Configure match'
    : isTerms
    ? 'Configure terms'
    : isExists
    ? 'Configure exists'
    : 'Edit custom block in place';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="drop-in group relative flex items-center gap-3 overflow-hidden rounded-md border border-neutral-200 bg-white pl-3 pr-3 py-2.5 shadow-sm transition-all hover:border-neutral-300 hover:shadow"
    >
      <span className={`absolute left-0 top-0 h-full w-1 ${meta.bar}`} aria-hidden />

      <span
        {...attributes}
        {...listeners}
        className="cursor-grab select-none pl-1 text-neutral-400 hover:text-neutral-700 active:cursor-grabbing"
        title="Drag to reorder or move between sections"
      >
        ⋮⋮
      </span>

      <span className="w-5 font-mono text-xs text-neutral-400">{String(index + 1).padStart(2, '0')}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-neutral-900">{label}</span>
          {isTemplate && (
            <span
              className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-700"
              title="Reusable template from the library"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M8 8h8" />
                <path d="M8 12h8" />
                <path d="M8 16h5" />
              </svg>
              template
            </span>
          )}
          {isCustom && (
            <span
              className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] text-indigo-700"
              title="Inline custom query"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M9 4c-1.5 0-2.5.7-2.5 2.5v2.4c0 1.7-1 2.6-2.5 2.6v1c1.5 0 2.5.9 2.5 2.6v2.4c0 1.8 1 2.5 2.5 2.5" />
                <path d="M15 4c1.5 0 2.5.7 2.5 2.5v2.4c0 1.7 1 2.6 2.5 2.6v1c-1.5 0-2.5.9-2.5 2.6v2.4c0 1.8-1 2.5-2.5 2.5" />
              </svg>
              custom
            </span>
          )}
          {isTimestamp && (
            <span
              className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] text-amber-700"
              title="Configurable timestamp range"
            >
              <span>⏱</span>
              range
            </span>
          )}
          {isTerm && (
            <span
              className="inline-flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] text-purple-700"
              title="Single-value term query"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 7h7" />
                <path d="M4 12h14" />
                <path d="M4 17h10" />
              </svg>
              term
            </span>
          )}
          {isMatch && (
            <span
              className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 font-mono text-[10px] text-rose-700"
              title="Full-text match query"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="6" />
                <path d="M16 16l5 5" />
              </svg>
              match
            </span>
          )}
          {isTerms && (
            <span
              className="inline-flex items-center gap-1 rounded border border-fuchsia-200 bg-fuchsia-50 px-1.5 py-0.5 font-mono text-[10px] text-fuchsia-700"
              title="Multi-value terms query"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="8" height="3" rx="1" />
                <rect x="13" y="5" width="8" height="3" rx="1" />
                <rect x="3" y="11" width="8" height="3" rx="1" />
                <rect x="13" y="11" width="8" height="3" rx="1" />
                <rect x="3" y="17" width="8" height="3" rx="1" />
              </svg>
              terms
            </span>
          )}
          {isExists && (
            <span
              className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] text-teal-700"
              title="Exists check"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              exists
            </span>
          )}
        </div>
        {description && (
          <div className="truncate text-xs text-neutral-500">{description}</div>
        )}
      </div>

      <div className="hidden truncate font-mono text-[11px] text-neutral-400 lg:block lg:max-w-[240px]">
        {queryPreview}
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {editable && (
          <button
            onClick={() => setEditing(true)}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            title={editLabel}
          >
            ✎
          </button>
        )}
        <button
          onClick={onRemove}
          className="rounded p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
          title="Remove from builder"
        >
          ×
        </button>
      </div>
    </div>
  );
}
