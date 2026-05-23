import { useEffect, useMemo, useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';
import { parseDateMath, formatResolved, toISOZ } from '../utils/dateMath';

type Props = {
  sectionMode: BoolMode;
  initialField: string;
  initialGte?: string;
  initialLte?: string;
  onSubmit: (patch: { field: string; gte?: string; lte?: string }) => void;
  onCancel: () => void;
};

// Per-bound single-value chips — set ONLY the matching field.
const BOUND_CHIPS = ['now-30d', 'now-7d', 'now-24h', 'now-1h', 'now-15m', 'now-5m', 'now'];

function describe(expr: string): { ok: boolean; text: string } {
  const trimmed = expr.trim();
  if (!trimmed) return { ok: true, text: '(open)' };
  const r = parseDateMath(trimmed);
  if (r.kind === 'ok') return { ok: true, text: `→ ${formatResolved(r.date)}` };
  return { ok: false, text: r.error };
}

export function TimestampRangeForm({
  sectionMode,
  initialField,
  initialGte,
  initialLte,
  onSubmit,
  onCancel,
}: Props) {
  const meta = MODE_META[sectionMode];
  const [field, setField] = useState(initialField);
  const [gte, setGte] = useState(initialGte ?? '');
  const [lte, setLte] = useState(initialLte ?? '');

  // Re-evaluate "now" once per second so the preview stays current.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const gteInfo = useMemo(() => describe(gte), [gte, tick]);
  const lteInfo = useMemo(() => describe(lte), [lte, tick]);

  const canSave = gteInfo.ok && lteInfo.ok && (gte.trim() || lte.trim());

  // Resolve `now`-expressions to absolute ISO timestamps so a saved range is
  // pinned to the moment of saving (and won't drift on every page load).
  // Already-absolute values (ISO strings) pass through unchanged.
  const resolveBound = (raw: string): string | undefined => {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (!trimmed.includes('now')) return trimmed;
    const r = parseDateMath(trimmed);
    return r.kind === 'ok' ? toISOZ(r.date) : trimmed;
  };

  // What will actually land in the saved query. Computed every render (and
  // every tick) so the JSON preview shows the exact value Save will produce.
  const gteOut = resolveBound(gte);
  const lteOut = resolveBound(lte);
  void tick; // dep so this re-computes each second for `now`-expressions

  const submit = () => {
    if (!canSave) return;
    onSubmit({
      field: field.trim() || 'createdAt',
      gte: gteOut,
      lte: lteOut,
    });
  };

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] ${meta.accentText} ${meta.softBorder}`}>
          ⏱ timestamp range in {meta.label}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Field
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none"
        value={field}
        onChange={(e) => setField(e.target.value)}
        placeholder="createdAt"
        spellCheck={false}
      />

      <div className="mt-3 grid grid-cols-2 gap-3">
        <BoundField
          label="From (gte)"
          value={gte}
          onChange={setGte}
          placeholder="now-15m"
          info={gteInfo}
          chips={BOUND_CHIPS}
        />
        <BoundField
          label="To (lte)"
          value={lte}
          onChange={setLte}
          placeholder="now"
          info={lteInfo}
          chips={BOUND_CHIPS}
        />
      </div>

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
          will save as
        </div>
        <div className="break-all">
          {`{ "range": { "${field.trim() || 'createdAt'}": { ${
            gteOut ? `"gte": "${gteOut}"` : ''
          }${gteOut && lteOut ? ', ' : ''}${
            lteOut ? `"lte": "${lteOut}"` : ''
          } } } }`}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          Save range
        </button>
      </div>
    </div>
  );
}

function PresetChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] transition ${
        active
          ? 'border-amber-400 bg-amber-100 text-amber-800'
          : 'border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-700'
      }`}
    >
      {label}
    </button>
  );
}

function BoundField({
  label,
  value,
  onChange,
  placeholder,
  info,
  chips,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  info: { ok: boolean; text: string };
  chips: string[];
}) {
  const trimmed = value.trim();
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </label>
      <input
        className={[
          'mt-1 w-full rounded-md border bg-white px-3 py-1.5 font-mono text-sm focus:outline-none',
          info.ok
            ? 'border-neutral-300 focus:border-neutral-500'
            : 'border-rose-400 focus:border-rose-500',
        ].join(' ')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      <div
        className={`mt-0.5 truncate font-mono text-[10px] ${
          info.ok ? 'text-neutral-500' : 'text-rose-600'
        }`}
        title={info.text}
      >
        {info.text}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {chips.map((c) => (
          <PresetChip
            key={c}
            label={c}
            active={trimmed === c}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}
