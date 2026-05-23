// Minimal Elasticsearch date-math parser.
//
// Supports the subset that covers ~all real usage:
//   - "now"
//   - "now" + any sequence of  +Nu  -Nu  /u  operators
//   - An ISO datetime, optionally followed by  ||  + math
//
// Units (Elasticsearch case-sensitive convention):
//   s second   m minute   h hour   d day   w week   M month   y year
//
// Round-down operators:
//   /u → snap to start of the unit (e.g. "now/d" = midnight UTC today)
//
// Examples that parse:
//   now             now-15m            now-1d/d           now/w
//   2026-01-01      2026-01-01||+1d    2026-01-01T12:00:00Z||/d

export type DateMathError = string;
export type DateMathResult =
  | { kind: 'ok'; date: Date }
  | { kind: 'error'; error: DateMathError };

type Unit = 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y';
const UNITS: ReadonlyArray<Unit> = ['s', 'm', 'h', 'd', 'w', 'M', 'y'];

export function parseDateMath(expr: string, anchor: Date = new Date()): DateMathResult {
  let s = expr.trim();
  if (!s) return { kind: 'error', error: 'empty' };

  let base: Date;
  if (s.startsWith('now')) {
    base = new Date(anchor.getTime());
    s = s.slice(3);
  } else {
    const sepIdx = s.indexOf('||');
    const isoStr = sepIdx === -1 ? s : s.slice(0, sepIdx);
    const parsed = parseISO(isoStr);
    if (!parsed.ok) {
      return { kind: 'error', error: parsed.error };
    }
    base = parsed.date;
    s = sepIdx === -1 ? '' : s.slice(sepIdx + 2);
  }

  while (s.length > 0) {
    const c = s[0];
    if (c === '+' || c === '-') {
      const m = s.match(/^([+-])(\d+)([smhdwMy])/);
      if (!m) {
        return {
          kind: 'error',
          error: `bad math near "${s}" (expected ±N{s|m|h|d|w|M|y})`,
        };
      }
      const num = Number(m[2]);
      const unit = m[3] as Unit;
      base = addUnits(base, c === '-' ? -num : num, unit);
      s = s.slice(m[0].length);
    } else if (c === '/') {
      const u = s[1] as Unit | undefined;
      if (!u || !UNITS.includes(u)) {
        return {
          kind: 'error',
          error: `bad rounding near "${s}" (expected /{s|m|h|d|w|M|y})`,
        };
      }
      base = roundDown(base, u);
      s = s.slice(2);
    } else {
      return { kind: 'error', error: `unexpected "${s}"` };
    }
  }

  return { kind: 'ok', date: base };
}

// Strict ISO-8601 / RFC-3339 parser. Rejects things `new Date()` silently
// accepts (e.g. "2026-13-99" → "2027-04-09").
//   YYYY-MM-DD
//   YYYY-MM-DD(T| )HH:MM
//   YYYY-MM-DD(T| )HH:MM:SS
//   YYYY-MM-DD(T| )HH:MM:SS.fff
//   …optionally followed by  Z  or  ±HH:MM  /  ±HHMM
const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function parseISO(s: string): { ok: true; date: Date } | { ok: false; error: string } {
  const trimmed = s.trim();
  if (!trimmed) {
    return { ok: false, error: 'empty timestamp' };
  }
  const m = trimmed.match(ISO_RE);
  if (!m) {
    return {
      ok: false,
      error: `invalid timestamp "${trimmed}" — expected YYYY-MM-DD[Thh:mm[:ss[.fff]][Z|±hh:mm]] or "now"`,
    };
  }
  const [, y, mo, d, h, mi, sec, frac, tz] = m;
  const Y = +y;
  const M = +mo;
  const D = +d;
  const H = h ? +h : 0;
  const Mi = mi ? +mi : 0;
  const S = sec ? +sec : 0;

  if (M < 1 || M > 12) return { ok: false, error: `invalid month "${mo}" (01–12)` };
  if (D < 1 || D > 31) return { ok: false, error: `invalid day "${d}" (01–31)` };
  if (H > 23) return { ok: false, error: `invalid hour "${h}" (00–23)` };
  if (Mi > 59) return { ok: false, error: `invalid minute "${mi}" (00–59)` };
  if (S > 59) return { ok: false, error: `invalid second "${sec}" (00–59)` };

  // Validate day-in-month (handles leap years through UTC overflow).
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  if (D > daysInMonth) {
    return { ok: false, error: `${y}-${mo} has ${daysInMonth} days, got day ${d}` };
  }

  const canonical =
    `${y}-${mo}-${d}T` +
    `${String(H).padStart(2, '0')}:${String(Mi).padStart(2, '0')}:${String(S).padStart(2, '0')}` +
    (frac ? `.${frac}` : '') +
    (tz ?? 'Z');
  const dt = new Date(canonical);
  if (Number.isNaN(dt.getTime())) {
    return { ok: false, error: `invalid timestamp "${trimmed}"` };
  }
  return { ok: true, date: dt };
}

// Format a Date as a compact ISO-8601 timestamp (UTC, no milliseconds) that
// our own parseISO accepts — useful when "freezing" a now-expression.
export function toISOZ(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function addUnits(d: Date, amount: number, unit: Unit): Date {
  const r = new Date(d.getTime());
  switch (unit) {
    case 's': r.setUTCSeconds(r.getUTCSeconds() + amount); break;
    case 'm': r.setUTCMinutes(r.getUTCMinutes() + amount); break;
    case 'h': r.setUTCHours(r.getUTCHours() + amount); break;
    case 'd': r.setUTCDate(r.getUTCDate() + amount); break;
    case 'w': r.setUTCDate(r.getUTCDate() + amount * 7); break;
    case 'M': r.setUTCMonth(r.getUTCMonth() + amount); break;
    case 'y': r.setUTCFullYear(r.getUTCFullYear() + amount); break;
  }
  return r;
}

function roundDown(d: Date, unit: Unit): Date {
  const r = new Date(d.getTime());
  switch (unit) {
    case 's': r.setUTCMilliseconds(0); break;
    case 'm': r.setUTCSeconds(0, 0); break;
    case 'h': r.setUTCMinutes(0, 0, 0); break;
    case 'd': r.setUTCHours(0, 0, 0, 0); break;
    case 'w': {
      // ES rounds to the ISO week (starts Monday in most locales — ES default
      // is locale-sensitive, but Monday is the safest pick).
      const day = r.getUTCDay(); // 0 = Sunday
      const diff = day === 0 ? -6 : 1 - day;
      r.setUTCDate(r.getUTCDate() + diff);
      r.setUTCHours(0, 0, 0, 0);
      break;
    }
    case 'M':
      r.setUTCDate(1);
      r.setUTCHours(0, 0, 0, 0);
      break;
    case 'y':
      r.setUTCMonth(0, 1);
      r.setUTCHours(0, 0, 0, 0);
      break;
  }
  return r;
}

export function formatResolved(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}
