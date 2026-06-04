// Helpers shared by the terms form, the row preview, and the query builder
// so the emitted values are identical everywhere.

// Strict JSON-number grammar: integers, decimals, negatives, exponents.
// Deliberately rejects '', whitespace-only, '0x10', 'Infinity', '1_000' —
// anything JSON.parse wouldn't accept as a number stays a string.
const NUMERIC_RE = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

export function isNumericString(s: string): boolean {
  const t = s.trim();
  if (!NUMERIC_RE.test(t)) return false;
  // Round-trip guard: only treat as a number when it prints back
  // identically. Big IDs beyond 2^53 ("9007199254740993") would silently
  // corrupt through Number(), and "1.50"/"1e5" would change notation —
  // all of those stay strings. The "will save as" preview shows the
  // result either way, so nothing converts behind the user's back.
  return String(Number(t)) === t;
}

// Remove wrapping double quotes: '"test"' → 'test'. Users often paste values
// straight out of JSON arrays; without this the generated query would
// double-quote them ("test" → ""test""). Loops so '""test""' also collapses.
// Quotes that aren't a full wrap (e.g. 'say "hi" twice') are left alone.
export function stripWrappingQuotes(s: string): string {
  let out = s.trim();
  while (out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

// A single value as it'll appear in the emitted query: with the row's
// `numeric` flag on, a numeric-looking value becomes a JSON number;
// anything else stays a string.
export function termOutputValue(value: string, numeric?: boolean): string | number {
  return numeric && isNumericString(value) ? Number(value) : value;
}

// Array version for the terms clause (mixed arrays are valid in an ES
// terms query — only the numeric-looking entries convert).
export function termsOutputValues(
  values: string[],
  numeric?: boolean
): Array<string | number> {
  if (!numeric) return values;
  return values.map((v) => termOutputValue(v, true));
}
