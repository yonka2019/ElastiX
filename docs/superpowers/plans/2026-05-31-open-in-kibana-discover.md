# Open in Kibana → Discover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Commit policy for THIS repo:** the owner's global rule is *never auto git commit/push without a direct request*. The `git commit` steps below are real and correct, but DO NOT run them until the owner explicitly asks. Implement + verify; commit on request.

**Goal:** Make the header's "Open in Kibana" button open **Kibana Discover** with the built bool query applied as a custom DSL filter, instead of opening Dev Tools Console.

**Architecture:** Add two pure, testable utilities — a minimal encode-only RISON encoder (`src/utils/rison.ts`) and a Discover-URL builder (`src/utils/kibana.ts`) that injects the bool query as one app-scoped custom filter against the configured data-view UUID, with a 7-year global time window. Rewrite `openInKibana` in `src/App.tsx` to use it and require `KIBANA_DATA_VIEW_ID`.

**Tech Stack:** React 18 + TypeScript 5 + Vite 5; add **vitest** for unit tests.

---

## File Structure

- `src/utils/rison.ts` (new) — pure encode-only RISON encoder. One responsibility: JS value → RISON string.
- `src/utils/rison.test.ts` (new) — unit tests for the encoder.
- `src/utils/kibana.ts` (new) — pure `buildDiscoverUrl(...)`. One responsibility: params → Discover URL.
- `src/utils/kibana.test.ts` (new) — unit tests for the URL builder.
- `src/App.tsx` (modify) — `openInKibana` + the button's `disabled`/`title`; add one import.
- `vitest.config.ts` (new) — test runner config (node env).
- `package.json` (modify) — add vitest devDep + `test` script.
- `README.md`, `.env.example` (modify) — `KIBANA_DATA_VIEW_ID` now required for the button.

No server changes — `/api/config` already returns `dataViewId`.

---

### Task 1: Add vitest tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest** (requires network/npm cache)

Run: `npm install -D vitest`
Expected: `vitest` added under devDependencies; exit 0.

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block, add a `test` entry:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

// The utils under test are pure (no DOM), so the lightweight node env is enough.
// Kept separate from vite.config.ts, which mounts the /api dev middleware.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: vitest runs and reports **"No test files found"** (exit code may be non-zero — that's fine; tests arrive in Task 2).

- [ ] **Step 5: Commit (only when owner asks)**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

### Task 2: RISON encoder (TDD)

**Files:**
- Test: `src/utils/rison.test.ts`
- Create: `src/utils/rison.ts`

- [ ] **Step 1: Write the failing test**

`src/utils/rison.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { risonEncode } from './rison';

describe('risonEncode', () => {
  it('encodes primitives', () => {
    expect(risonEncode(true)).toBe('!t');
    expect(risonEncode(false)).toBe('!f');
    expect(risonEncode(null)).toBe('!n');
    expect(risonEncode(42)).toBe('42');
    expect(risonEncode(-1.5)).toBe('-1.5');
  });

  it('always single-quotes strings, including ones with @ and dots', () => {
    expect(risonEncode('hello')).toBe("'hello'");
    expect(risonEncode('')).toBe("''");
    expect(risonEncode('@timestamp')).toBe("'@timestamp'");
    expect(risonEncode('user.id')).toBe("'user.id'");
  });

  it("escapes ! and ' inside strings (! is the escape char)", () => {
    expect(risonEncode("it's")).toBe("'it!'s'");
    expect(risonEncode('a!b')).toBe("'a!!b'");
    // input is the two chars: ! then '  => "!!" + "!'" => !!!'  wrapped in quotes
    expect(risonEncode("!'")).toBe("'!!!''");
  });

  it('encodes arrays', () => {
    expect(risonEncode([])).toBe('!()');
    expect(risonEncode([1, 'a', true])).toBe("!(1,'a',!t)");
  });

  it('encodes objects with quoted keys, skipping undefined values', () => {
    expect(risonEncode({})).toBe('()');
    expect(risonEncode({ a: 1, b: 'x' })).toBe("('a':1,'b':'x')");
    expect(risonEncode({ a: 1, gone: undefined as unknown as null, b: 2 }))
      .toBe("('a':1,'b':2)");
  });

  it('encodes nested bool DSL', () => {
    expect(risonEncode({ bool: { must: [{ term: { env: 'prod' } }] } }))
      .toBe("('bool':('must':!(('term':('env':'prod')))))");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/rison.test.ts`
Expected: FAIL — cannot resolve module `./rison`.

- [ ] **Step 3: Write the minimal implementation**

`src/utils/rison.ts`:

```ts
// Minimal, encode-only RISON encoder — just enough to build Kibana Discover URLs.
// RISON is the compact, URL-friendly encoding Kibana uses for its _g / _a app state.
// We only ENCODE (never parse), and we ALWAYS single-quote strings. Always-quoting is
// valid RISON, sidesteps the fragile bare-identifier rules, and correctly handles field
// names like `@timestamp` or `user.id` that could never be bare identifiers anyway.

export type RisonValue =
  | string
  | number
  | boolean
  | null
  | RisonValue[]
  | { [key: string]: RisonValue };

function encodeString(s: string): string {
  // Inside a quoted RISON string, `!` is the escape char: a literal `!` is `!!`,
  // a literal `'` is `!'`. Escape `!` first so the `!` we add for `'` isn't doubled.
  const escaped = s.replace(/!/g, '!!').replace(/'/g, "!'");
  return `'${escaped}'`;
}

export function risonEncode(value: RisonValue): string {
  if (value === null) return '!n';
  if (typeof value === 'boolean') return value ? '!t' : '!f';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('rison: cannot encode non-finite number');
    return String(value);
  }
  if (typeof value === 'string') return encodeString(value);
  if (Array.isArray(value)) {
    return `!(${value.map(risonEncode).join(',')})`;
  }
  const parts: string[] = [];
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (v === undefined) continue; // mirror JSON.stringify: drop undefined members
    parts.push(`${encodeString(key)}:${risonEncode(v)}`);
  }
  return `(${parts.join(',')})`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/rison.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit (only when owner asks)**

```bash
git add src/utils/rison.ts src/utils/rison.test.ts
git commit -m "feat: add minimal RISON encoder"
```

---

### Task 3: `buildDiscoverUrl` (TDD)

**Files:**
- Test: `src/utils/kibana.test.ts`
- Create: `src/utils/kibana.ts`

- [ ] **Step 1: Write the failing test**

`src/utils/kibana.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDiscoverUrl } from './kibana';

describe('buildDiscoverUrl', () => {
  const url = buildDiscoverUrl({
    kibanaUrl: 'https://kibana.local',
    dataViewId: 'abc-123',
    query: { bool: { must: [{ term: { env: 'prod' } }] } },
  });

  it('targets the Discover route', () => {
    expect(url.startsWith('https://kibana.local/app/discover#/?_g=')).toBe(true);
  });

  it('sets a 7-year global time window', () => {
    const g = url.match(/_g=([^&]*)/)![1];
    expect(decodeURIComponent(g)).toBe("('time':('from':'now-7y','to':'now'))");
  });

  it('carries the bool query as a custom filter against the data view', () => {
    const a = url.split('&_a=')[1];
    expect(decodeURIComponent(a)).toBe(
      "('columns':!()," +
        "'index':'abc-123'," +
        "'interval':'auto'," +
        "'query':('language':'kuery','query':'')," +
        "'filters':!((" +
          "'$state':('store':'appState')," +
          "'meta':('alias':'ElastiX query','disabled':!f,'negate':!f,'index':'abc-123','type':'custom')," +
          "'query':('bool':('must':!(('term':('env':'prod')))))" +
        ")))"
    );
  });

  it('leaves RISON structural chars literal but percent-encodes spaces', () => {
    const a = url.split('&_a=')[1];
    expect(a).toContain('%20');     // the space in 'ElastiX query'
    expect(a).toContain(':');        // structural colon stays literal
    expect(a).toContain(',');        // structural comma stays literal
    expect(a).not.toContain('%3A');  // colons are NOT percent-encoded
  });

  it('strips a trailing slash on the kibana url', () => {
    const u = buildDiscoverUrl({ kibanaUrl: 'https://k/', dataViewId: 'x', query: { match_all: {} } });
    expect(u.startsWith('https://k/app/discover')).toBe(true);
  });

  it('encodes a match_all fallback query', () => {
    const u = buildDiscoverUrl({ kibanaUrl: 'https://k', dataViewId: 'x', query: { match_all: {} } });
    expect(decodeURIComponent(u)).toContain("'query':('match_all':())");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/kibana.test.ts`
Expected: FAIL — cannot resolve module `./kibana`.

- [ ] **Step 3: Write the minimal implementation**

`src/utils/kibana.ts`:

```ts
import { risonEncode, type RisonValue } from './rison';

export interface DiscoverUrlParams {
  /** Kibana base URL; a trailing slash is tolerated. */
  kibanaUrl: string;
  /** Kibana data view (index pattern) UUID. */
  dataViewId: string;
  /** The inner ES query DSL, e.g. { bool: {...} } or { match_all: {} }. */
  query: Record<string, unknown>;
}

// Mirror Kibana's `encodeUriQuery`: percent-encode, then restore the RISON structural
// characters Kibana leaves literal in the hash (`:`, `,`, `@`, `$`). `encodeURIComponent`
// already leaves `( ) ! ' * - _ . ~` literal and percent-encodes spaces (%20), `"` (%22),
// and `&`/`=` (so the _g=…&_a=… separators are never broken).
function encodeRisonForUrl(rison: string): string {
  return encodeURIComponent(rison)
    .replace(/%3A/gi, ':')
    .replace(/%2C/gi, ',')
    .replace(/%40/g, '@')
    .replace(/%24/g, '$');
}

export function buildDiscoverUrl({ kibanaUrl, dataViewId, query }: DiscoverUrlParams): string {
  const base = kibanaUrl.replace(/\/$/, '');

  const globalState: RisonValue = {
    time: { from: 'now-7y', to: 'now' },
  };

  const appState: RisonValue = {
    columns: [],
    index: dataViewId,
    interval: 'auto',
    query: { language: 'kuery', query: '' },
    filters: [
      {
        $state: { store: 'appState' },
        meta: {
          alias: 'ElastiX query',
          disabled: false,
          negate: false,
          index: dataViewId,
          type: 'custom',
        },
        query: query as unknown as RisonValue,
      },
    ],
  };

  const g = encodeRisonForUrl(risonEncode(globalState));
  const a = encodeRisonForUrl(risonEncode(appState));
  return `${base}/app/discover#/?_g=${g}&_a=${a}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/kibana.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit (only when owner asks)**

```bash
git add src/utils/kibana.ts src/utils/kibana.test.ts
git commit -m "feat: add Discover URL builder"
```

---

### Task 4: Wire into the button (`App.tsx`)

**Files:**
- Modify: `src/App.tsx` (import after line 26; `openInKibana` at 807-814; button `disabled` at 957 and `title` at 959-963)

- [ ] **Step 1: Add the import**

After `import { useTheme } from './utils/theme';` (line 26), add:

```ts
import { buildDiscoverUrl } from './utils/kibana';
```

- [ ] **Step 2: Replace `openInKibana`**

Replace the existing function (lines 807-814):

```ts
  const openInKibana = () => {
    if (!config.kibanaUrl || !config.dataViewId) return;
    const built = buildQuery(templates, blocks) as { query?: Record<string, unknown> };
    const inner = built.query ?? { match_all: {} };
    const url = buildDiscoverUrl({
      kibanaUrl: config.kibanaUrl,
      dataViewId: config.dataViewId,
      query: inner,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };
```

- [ ] **Step 3: Update the button's `disabled` and `title`**

Change `disabled={!config.kibanaUrl}` (line 957) to:

```tsx
            disabled={!config.kibanaUrl || !config.dataViewId}
```

Change the `title` expression (lines 959-963) to:

```tsx
            title={
              config.kibanaUrl && config.dataViewId
                ? `Open this query in Discover on ${config.kibanaUrl}`
                : 'Set KIBANA_URL and KIBANA_DATA_VIEW_ID in .env to enable'
            }
```

- [ ] **Step 4: Type-check + build**

Run: `npm run build`
Expected: `tsc -b` passes (no type errors) and `vite build` writes `./dist` with exit 0.

- [ ] **Step 5: Commit (only when owner asks)**

```bash
git add src/App.tsx
git commit -m "feat: open in Kibana opens Discover with the query as a custom filter"
```

---

### Task 5: Update docs

**Files:**
- Modify: `README.md` (env table row for `KIBANA_DATA_VIEW_ID`)
- Modify: `.env.example` (lines 15-19)

- [ ] **Step 1: README env table**

Replace the `KIBANA_DATA_VIEW_ID` row:

```markdown
| `KIBANA_DATA_VIEW_ID` | Kibana data-view (index pattern) UUID. **Required** for the **Open in Kibana** button — it opens Discover with the query as a custom filter against this data view. |
```

Also update the **Open in Kibana** line under "Features" (the "open-in-Kibana" mention near "copy + count docs + open-in-Kibana") if it implies Dev Tools — change to note it opens **Discover**.

- [ ] **Step 2: `.env.example`**

Replace lines 15-19 with:

```bash
# Kibana (for "Open in Kibana" button → opens Discover)
KIBANA_URL=https://your-kibana.example.com
# Required for the button: the Discover data view (index pattern) UUID.
# The query is injected as a custom DSL filter against this data view.
KIBANA_DATA_VIEW_ID=
```

- [ ] **Step 3: Commit (only when owner asks)**

```bash
git add README.md .env.example
git commit -m "docs: KIBANA_DATA_VIEW_ID required for Open in Discover"
```

---

### Task 6: Manual verification against live Kibana

This is the real proof — the URL format is version-sensitive.

- [ ] **Step 1:** Ensure `.env` has `KIBANA_URL` and a valid `KIBANA_DATA_VIEW_ID`, then `npm run dev`.
- [ ] **Step 2:** Build a non-trivial query (e.g. a `must` with a `term`, plus a nested block).
- [ ] **Step 3:** Click **Open in Kibana**. Confirm a new tab opens **Discover** (not Dev Tools).
- [ ] **Step 4:** Confirm a filter pill labeled **"ElastiX query"** is present and the document table reflects the query. The time picker should read **last 7 years**.
- [ ] **Step 5:** Click the pill → "Edit as Query DSL" and confirm the DSL matches ElastiX's Generated Query.
- [ ] **Step 6:** Edge check: empty builder → button still opens Discover showing all docs (match_all); button is disabled when `KIBANA_DATA_VIEW_ID` is unset.

**If the filter doesn't apply:** the likely culprit is hash URI-encoding. Compare against a filter you build by hand in Discover (copy its URL) and adjust `encodeRisonForUrl` / the `meta` fields to match.

---

## Self-Review

**Spec coverage:**
- Custom DSL filter approach → Tasks 2-3. ✅
- 7-year time window → Task 3 (`now-7y`) + test. ✅
- One filter for whole bool, app-scoped → Task 3 (`$state.store: appState`). ✅
- Data-view UUID required; button disabled otherwise → Task 4. ✅
- `/api/config` unchanged → noted, no task needed. ✅
- README + .env.example → Task 5. ✅
- vitest + unit tests for both utils → Tasks 1-3. ✅
- Manual Kibana verification + URI-encoding risk → Task 6. ✅

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `risonEncode(value: RisonValue): string` and `RisonValue` are used identically in Task 2 and imported in Task 3. `buildDiscoverUrl(params: DiscoverUrlParams): string` with `{ kibanaUrl, dataViewId, query }` matches its call site in Task 4. `config.dataViewId` / `config.kibanaUrl` match `ElastixConfig` in `store.ts`. ✅
