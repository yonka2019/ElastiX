# Open in Kibana → Discover (not Dev Tools)

**Date:** 2026-05-31
**Status:** Approved (design), pending implementation

## Problem

The header's **Open in Kibana** button currently opens **Dev Tools Console** with a
`GET <index>/_search` command pre-loaded (`src/App.tsx` `openInKibana`). The user wants
it to open **Discover** instead, landing in the document table with the built query applied.

## Key constraint

Discover's search bar speaks **KQL/Lucene**, *not* Elasticsearch bool DSL. ElastiX exists to
build arbitrary bool DSL (nested queries, ranges, wildcards, free-JSON "custom" clauses), none
of which round-trip through KQL faithfully. Therefore the query must be carried into Discover as
a **custom DSL filter** in the app-state, which references a **data view UUID**.

`KIBANA_DATA_VIEW_ID` is already plumbed through `/api/config` → `config.dataViewId`. The user
has confirmed it is set.

## Chosen approach

Build a Discover URL of the form:

```
<KIBANA_URL>/app/discover#/?_g=(time:(from:now-7y,to:now))&_a=(<app state>)
```

- `_g.time` = **last 7 years** (`from:now-7y,to:now`) so the query's own clauses dominate and
  matches actually appear regardless of an index time field. Harmless for non-time-based data views.
- `_a` carries the whole bool query as **one** app-scoped custom filter (not one pill per block):

```
_a=(columns:!(),index:'<dataViewId>',interval:auto,
    query:(language:kuery,query:''),
    filters:!(('$state':(store:appState),
      meta:(alias:'ElastiX query',disabled:!f,negate:!f,index:'<dataViewId>',type:custom),
      query:(<inner bool DSL>))))
```

The inner DSL is `buildQuery(templates, blocks).query`, falling back to `{ match_all: {} }` when
the builder is empty.

Rejected alternatives: convert to KQL (B) or Lucene `query_string` (C) — both silently lose
fidelity for `nested` and free-JSON custom clauses.

## Components

### `src/utils/rison.ts` (new) — pure, encode-only
A minimal rison encoder. Sufficient surface for the values we emit:
- objects `(k:v,k:v)`, empty `()`
- arrays `!(a,b)`, empty `!()`
- booleans `!t` / `!f`, null `!n`
- numbers verbatim
- strings: single-quoted with `!` as escape char (`'` → `!'`, `!` → `!!`). Always-quoting strings
  is valid rison and avoids the fragile bare-identifier regex; object keys encoded the same way.

### `src/utils/kibana.ts` (new) — pure
`buildDiscoverUrl({ kibanaUrl, dataViewId, query }): string`
1. Build `_g` and `_a` plain objects (as above).
2. rison-encode each.
3. Apply **Kibana-style URI encoding**: leave rison structural chars literal
   (`( ) : , ! ' * @ $ -`), percent-encode the rest (spaces, `"`, `#`, `%`, etc.). This matches
   how Kibana itself writes the hash (confirmed against a real Discover URL: structural chars
   literal, space→`%20`, `"`→`%22`).
4. Return `` `${kibanaUrl}/app/discover#/?_g=${g}&_a=${a}` ``.

### `src/App.tsx` — edits
- `openInKibana()` rewritten to call `buildDiscoverUrl({ kibanaUrl: config.kibanaUrl,
  dataViewId: config.dataViewId, query: inner })` and `window.open(url, '_blank', 'noopener,noreferrer')`.
- Button `disabled` condition: `!config.kibanaUrl || !config.dataViewId` (Discover needs the
  data view). Tooltip when disabled names **both** `KIBANA_URL` and `KIBANA_DATA_VIEW_ID`.

### Server
No change. `/api/config` (`server/elasticApi.js`) already returns `dataViewId`.

### Docs
- `README.md` env table: `KIBANA_DATA_VIEW_ID` is now **required** for the Open in Kibana button
  (was "optional Discover data-view UUID").
- `.env.example`: same note.

## Data flow
1. On load, frontend fetches `/api/config` → `{ kibanaUrl, indexPattern, dataViewId, ready }`.
2. User builds blocks → `buildQuery` → inner DSL.
3. Click → `buildDiscoverUrl(...)` → `window.open(url)`.

## Error handling / edge cases
- Missing `kibanaUrl` or `dataViewId` → button disabled, explanatory tooltip.
- Empty builder → `match_all`.
- rison encoder must handle: empty objects/arrays, strings containing `'`, `!`, and unicode;
  numbers; deeply nested objects (bool/nested clauses).

## Testing
Add **vitest** as a devDep + `"test": "vitest run"` script. Unit tests for the two pure utils:
- `rison.ts`: escaping table (bare-ish string, string with quote/`!`, empty string, nested
  object, array, booleans, null, numbers).
- `kibana.ts`: a known bool query → expected URL (assert `_g` time = `now-7y`, the custom filter
  shape, the data view id, structural chars left literal while a space in a value is `%20`).

Final proof: click the button against the real Kibana and confirm the "ElastiX query" filter pill
applies and the doc table reflects the query.

## Main risk
Exact hash URI-encoding Kibana accepts. Mitigation: mirror Kibana's `encodeUriQuery` behavior
(structural chars literal) and verify against the user's live Kibana before declaring done.
