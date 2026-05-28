import { v4 as uuidv4 } from 'uuid';
import type { BoolMode, BuilderItem, ModeBlock } from '../types';

// Parse a raw Elasticsearch query JSON into the app's ModeBlock[] model.
// Designed to be lossy-but-honest: unrecognised clauses become `custom`
// items carrying the original JSON, so re-exporting still produces the
// equivalent query. Recognised clauses become typed leaves the user can
// edit through the regular form UI.

type Q = Record<string, unknown>;

const isObject = (x: unknown): x is Q =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function asString(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isObject(v) && 'value' in v) return asString((v as Q).value);
  return undefined;
}

// {field: value} → ('field', value). Picks the first non-meta key so query
// shapes that include "boost"/"_name" alongside the field still parse.
const META_KEYS = new Set(['boost', '_name']);
function pickField(obj: Q): { field: string; value: unknown } | null {
  for (const k of Object.keys(obj)) {
    if (!META_KEYS.has(k)) return { field: k, value: obj[k] };
  }
  return null;
}

// Per-parse counter so generated custom-block names are stable & sequential
// within one import call.
class Counter {
  private n = 0;
  next(): number {
    this.n += 1;
    return this.n;
  }
}

function customItem(clause: Q, counter: Counter): BuilderItem {
  return {
    instanceId: uuidv4(),
    source: {
      kind: 'custom',
      name: `custom #${counter.next()}`,
      query: clause,
    },
  };
}

function parseClause(clause: unknown, counter: Counter): BuilderItem | null {
  if (!isObject(clause)) return null;
  const keys = Object.keys(clause);
  if (keys.length === 0) return null;
  const kind = keys[0];
  const body = clause[kind];

  if (kind === 'match_all') return null;

  if (kind === 'term' && isObject(body)) {
    const f = pickField(body);
    if (!f) return customItem(clause, counter);
    const value = asString(f.value);
    if (value === undefined) return customItem(clause, counter);
    return {
      instanceId: uuidv4(),
      source: { kind: 'term', field: f.field, value },
    };
  }

  if (kind === 'match' && isObject(body)) {
    const f = pickField(body);
    if (!f) return customItem(clause, counter);
    const value = asString(f.value);
    if (value === undefined) return customItem(clause, counter);
    return {
      instanceId: uuidv4(),
      source: { kind: 'match', field: f.field, value },
    };
  }

  if (kind === 'wildcard' && isObject(body)) {
    const f = pickField(body);
    if (!f) return customItem(clause, counter);
    const value = asString(f.value);
    if (value === undefined) return customItem(clause, counter);
    return {
      instanceId: uuidv4(),
      source: { kind: 'wildcard', field: f.field, value },
    };
  }

  if (kind === 'terms' && isObject(body)) {
    const f = pickField(body);
    if (!f || !Array.isArray(f.value)) return customItem(clause, counter);
    const values = f.value
      .map((v) => asString(v))
      .filter((v): v is string => v !== undefined);
    if (values.length === 0) return customItem(clause, counter);
    return {
      instanceId: uuidv4(),
      source: { kind: 'terms', field: f.field, values },
    };
  }

  if (kind === 'exists' && isObject(body) && typeof body.field === 'string') {
    return {
      instanceId: uuidv4(),
      source: { kind: 'exists', field: body.field },
    };
  }

  if (kind === 'range' && isObject(body)) {
    const f = pickField(body);
    if (!f || !isObject(f.value)) return customItem(clause, counter);
    const range = f.value;
    const gte = asString(range.gte);
    const lte = asString(range.lte);
    if (gte === undefined && lte === undefined) return customItem(clause, counter);
    return {
      instanceId: uuidv4(),
      source: { kind: 'timestamp', field: f.field, gte, lte },
    };
  }

  if (kind === 'nested' && isObject(body)) {
    const path = typeof body.path === 'string' ? body.path : '';
    const inner = body.query;
    if (!isObject(inner)) return customItem(clause, counter);
    const block = parseSingleBoolBlock(inner, counter, { nested: true, path });
    if (!block) return customItem(clause, counter);
    return { instanceId: uuidv4(), source: { kind: 'bool', block } };
  }

  if (kind === 'bool' && isObject(body)) {
    const block = parseSingleBoolBlock(clause, counter);
    if (!block) return customItem(clause, counter);
    return { instanceId: uuidv4(), source: { kind: 'bool', block } };
  }

  // Anything else (query_string, multi_match, geo_*, function_score, etc.)
  return customItem(clause, counter);
}

// Read a `{ bool: { must, should, must_not, filter } }` (or a bare inner
// bool body when stripping a wrapper) and pack it into ONE ModeBlock.
// The data model only allows one mode per block, so a multi-mode bool can
// not be represented as a single block — return null and let the caller
// fall back to custom. `filter` is merged into `must`.
function parseSingleBoolBlock(
  full: Q,
  counter: Counter,
  options?: { nested: true; path: string }
): ModeBlock | null {
  const innerBool = isObject(full.bool) ? full.bool : full;
  if (!isObject(innerBool)) return null;

  const buckets: { mode: BoolMode; clauses: unknown[] }[] = [];
  const must = [
    ...(Array.isArray(innerBool.must) ? innerBool.must : []),
    ...(Array.isArray(innerBool.filter) ? innerBool.filter : []),
  ];
  if (must.length) buckets.push({ mode: 'must', clauses: must });
  if (Array.isArray(innerBool.should) && innerBool.should.length)
    buckets.push({ mode: 'should', clauses: innerBool.should });
  if (Array.isArray(innerBool.must_not) && innerBool.must_not.length)
    buckets.push({ mode: 'must_not', clauses: innerBool.must_not });

  if (buckets.length === 0) return null;
  if (buckets.length > 1) return null;

  const { mode, clauses } = buckets[0];
  const items: BuilderItem[] = [];
  for (const c of clauses) {
    const it = parseClause(c, counter);
    if (it) items.push(it);
  }

  const block: ModeBlock = {
    id: `blk-${uuidv4().slice(0, 8)}`,
    mode,
    items,
  };
  if (options?.nested) block.nested = { path: options.path };
  return block;
}

export type ImportResult = {
  blocks: ModeBlock[];
  // True iff input parsed but produced no clauses (e.g. match_all or {}).
  empty: boolean;
};

export function parseQueryToBlocks(input: unknown): ImportResult {
  const counter = new Counter();
  if (!isObject(input)) return { blocks: [], empty: true };

  let root: Q = input;
  if (isObject(input.query) && Object.keys(input).length === 1) {
    root = input.query;
  }

  const rootKeys = Object.keys(root);
  if (rootKeys.length === 0) return { blocks: [], empty: true };
  if (rootKeys.length === 1 && rootKeys[0] === 'match_all') {
    return { blocks: [], empty: true };
  }

  // Top-level bool: distribute its mode buckets into ordered top-level
  // ModeBlocks so the imported query reads the same way as one composed by
  // hand in the builder.
  if (isObject(root.bool) && rootKeys.length === 1) {
    const innerBool = root.bool;
    const blocks: ModeBlock[] = [];
    const push = (mode: BoolMode, arr: unknown): void => {
      if (!Array.isArray(arr) || arr.length === 0) return;
      const items: BuilderItem[] = [];
      for (const c of arr) {
        const it = parseClause(c, counter);
        if (it) items.push(it);
      }
      if (items.length === 0) return;
      blocks.push({
        id: `blk-${uuidv4().slice(0, 8)}`,
        mode,
        items,
      });
    };
    const mustClauses = [
      ...(Array.isArray(innerBool.must) ? innerBool.must : []),
      ...(Array.isArray(innerBool.filter) ? innerBool.filter : []),
    ];
    push('must', mustClauses);
    push('should', innerBool.should);
    push('must_not', innerBool.must_not);
    return { blocks, empty: blocks.length === 0 };
  }

  // Bare single clause at root — wrap into one `must` block so it shows up.
  const item = parseClause(root, counter);
  if (!item) return { blocks: [], empty: true };
  return {
    blocks: [
      {
        id: `blk-${uuidv4().slice(0, 8)}`,
        mode: 'must',
        items: [item],
      },
    ],
    empty: false,
  };
}
