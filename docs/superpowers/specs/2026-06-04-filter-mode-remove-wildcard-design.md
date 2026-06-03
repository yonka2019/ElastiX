# Filter condition block + wildcard removal — Design

**Date:** 2026-06-04
**Status:** Approved

## Goal

1. Add `filter` as a fourth bool condition block (alongside `must` / `should` / `must_not`), mapping to Elasticsearch `bool.filter` — matches like `must` but without scoring, cacheable.
2. Remove the `wildcard` leaf clause entirely (palette, form, types, store, import), migrating existing saved wildcard rows to `custom` rows.

## Design

### 1. New `filter` mode

- `src/types.ts`: `BoolMode` becomes `'must' | 'filter' | 'should' | 'must_not'`; `MODE_ORDER = ['must', 'filter', 'should', 'must_not']` (ES docs order — drives palette order, output key order, count chips). New `MODE_META.filter` entry using the **violet** color family (free slot: must=emerald, should=sky, must_not=rose, nested=orange), word `FILTER`, sentence "document must match all of these — no scoring, cacheable". `emptySections()` gains `filter: []`.
- `src/components/icons.tsx`: `ModeIcon` gets a funnel glyph for `filter`.
- Palette card, query output (`bool.filter`), and header count chips follow automatically from `MODE_ORDER` / `MODE_META`; TypeScript forces the remaining `Record<BoolMode, …>` spots (`modeOccurrences`, bool buckets in `makeBoolInnerWithMap`, the v2→v3 migration literal).

### 2. Import (`src/utils/importQuery.ts`)

- Top-level `bool.filter` clauses land in their own `filter` block instead of merging into `must`.
- Inner bools: `filter` becomes its own bucket in `parseSingleBoolBlock`. A nested bool with both `must` and `filter` is now 2 buckets → falls back to a `custom` JSON row (existing "lossy-but-honest" rule).

### 3. Wildcard removal (full sweep)

- Delete `src/components/WildcardForm.tsx`.
- Strip the kind from: `types.ts` (`BuilderSource` union), `ModeBlockPalette.tsx` (card + glyph + `LeafPaletteId`), `App.tsx` (drag types + handlers + overlay), `BuilderRow.tsx` (editing branch, preview, badge), `store.ts` (`addWildcardToBlock`, `updateWildcardItem`, query-build branch), `importQuery.ts` (parse branch — pasted wildcard queries become `custom` rows via the existing fallback).
- Update README mention.

### 4. Migration (`src/store.ts`)

- Persist version 6 → 7: recursively convert saved wildcard rows to `custom` rows — `name: title || "wildcard: <field>"`, `query: { wildcard: { <field>: <value> } }`. Emitted query stays identical.

## Out of scope

- No backend/server changes — `bool.filter` is standard ES and flows through count/Kibana links untouched.
- No new leaf clause types.
