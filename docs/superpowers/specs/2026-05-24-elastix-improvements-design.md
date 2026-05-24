# ElastiX improvements — design spec

**Date:** 2026-05-24
**Status:** Proposed
**Author:** brainstorm session w/ yonka

## Background

ElastiX is a Vite + React SPA for building Elasticsearch bool queries by drag-and-drop. The app runs in two modes:

- **Dev** — `npm run dev`. Vite serves the SPA and `vite.config.ts` mounts an `elasticDevApi` plugin that exposes `GET /api/config` + `POST /api/count`, reading creds from `.env`.
- **Prod** — `server.js` (the Docker/K8s image). A static Node server that inlines `templates.json` into `index.html` from a ConfigMap mount. **It does not implement `/api/config` or `/api/count`.**

This spec bundles eight changes raised in one brainstorm session. Most are small and independent; one (dark mode) touches every component.

## Goals

1. The app is fully usable on an offline PC (no CDN dependencies).
2. The "Generated Query" JSON view supports expanding/collapsing nested groups.
3. The user can switch between light and dark themes; choice survives reloads.
4. Templates can be searched within the existing right-side library.
5. The user can save and restore the full ElastiX builder state (blocks + custom labels + nested structure) as a JSON file.
6. The clause palette includes a `wildcard` leaf for Elasticsearch `wildcard` queries.
7. The "by yonka" credit moves out of the header into a footer.
8. The "Open in Kibana" button has a clearer icon.
9. "Open in Kibana" and "Count docs" work in production, not just dev mode.
10. Each block, each template-derived row, and each template card in the library has an eye button that opens a small popup showing its JSON.

## Non-goals

- Importing a raw Elasticsearch query JSON (only ElastiX builder state, with its own envelope).
- Per-node collapse state that survives query edits in the JsonTree viewer.
- A separate modal/popover for browsing templates (the existing right sidebar stays).
- Restyling the existing color palette — dark mode only adds `dark:` variants; light theme is unchanged.

---

## 1. Offline JSON viewer with collapse/expand

### Problem
`@monaco-editor/react` loads Monaco from `cdn.jsdelivr.net` at runtime via `@monaco-editor/loader`. On an offline PC the editor never renders.

### Solution
Drop both `@monaco-editor/*` packages. Add a small custom `JsonTree` component.

### Component contract — `src/components/JsonTree.tsx`

```ts
type Props = { value: unknown };
export function JsonTree({ value }: Props): JSX.Element;
```

- Renders recursively. Primitives (`string`, `number`, `boolean`, `null`) render as colored spans inline.
- Objects render as `{` + collapsible body + `}`. Arrays as `[` ... `]`.
- Each container has a `▾` / `▸` toggle to its left. When collapsed, body is replaced with a summary: `{ … 4 keys }` or `[ … 3 items ]`.
- Indentation per depth via inline `style={{ paddingLeft: depth * 12 }}` or `pl-3` Tailwind utilities accumulated at each level.
- Default state: top-level expanded, every nested level expanded. Collapse state is component-local React state — resets when the input `value` changes (acceptable; the JSON itself changes whenever the user edits the builder).
- Read-only. Selection / copy works because it's normal DOM text.
- Syntax colors (light theme defaults; dark variants in §2):
  - Key: `text-sky-700` (dark: `text-sky-300`)
  - String: `text-emerald-700` (dark: `text-emerald-300`)
  - Number: `text-amber-700` (dark: `text-amber-300`)
  - Boolean / null: `text-rose-700` (dark: `text-rose-300`)
  - Punctuation `{}[],:`: `text-neutral-500`

### QueryOutput.tsx changes
- Remove `import Editor from '@monaco-editor/react'`.
- Replace the `<Editor ... />` block with `<JsonTree value={built} />` inside a scrollable `<div>`.
- Keep the header chrome (collapse toggle, count chip, Copy JSON button, Count docs button) unchanged.
- `useMemo(() => JSON.stringify(built, null, 2), [built])` is no longer needed for display; keep it only for the Copy JSON button.

### Dependency removal
`package.json`:
- Remove `"@monaco-editor/react": "^4.6.0"`. (`@monaco-editor/loader` is a transitive dep — removing the parent removes it on `npm install`.)

### Risks
- Visual regression: no line numbers, no Monaco minimap, no search-in-editor. Acceptable per brainstorm.
- Performance for huge JSON: not a concern; built queries are < a few KB in practice.

---

## 2. Dark mode

### Mechanism
Tailwind class-based dark mode.

`tailwind.config.js`:
```js
darkMode: 'class',
```

`<html>` gets `class="dark"` toggled by the theme hook. All existing components stay light by default and gain `dark:` variants.

### State — `src/utils/theme.ts`

```ts
type Theme = 'light' | 'dark';
export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void };
```

- On mount: read `localStorage.getItem('elastix-theme')`. If `'light'` or `'dark'`, use it. Otherwise read `window.matchMedia('(prefers-color-scheme: dark)').matches` and use that.
- On change: write `<html class>` and `localStorage`.
- Listen for `matchMedia` changes only when no localStorage value is set (system-driven mode). Once the user clicks the toggle, their choice overrides system preference until they clear `localStorage`.

### UI
Sun/moon icon button in `Header`, placed to the **left** of "Open in Kibana" (which itself is to the left of the new Export/Import buttons — see §4).

```
[ logo ElastiX by ... ]  ... drag hint ...    [☀/🌙] [Export] [Import] [Open in Kibana]
```

### Scope of color work

Every component currently uses literal `bg-white`, `bg-neutral-50`, `bg-neutral-100`, `border-neutral-200`, `text-neutral-900`, `text-neutral-500`, etc. Add `dark:` variants. Files touched:

- `src/App.tsx` (root `bg-neutral-50`, `Header`)
- `src/components/QueryOutput.tsx` (the blue-gradient header, count/copy chips)
- `src/components/TemplateLibrary.tsx`
- `src/components/TemplateCard.tsx`
- `src/components/Builder.tsx`
- `src/components/BuilderRow.tsx`
- `src/components/BlockCard.tsx`
- `src/components/ModeBlockPalette.tsx`
- `src/components/CustomBlockForm.tsx`
- `src/components/TimestampRangeForm.tsx`
- `src/components/TermForm.tsx`
- `src/components/MatchForm.tsx`
- `src/components/TermsForm.tsx`
- `src/components/ExistsForm.tsx`
- new `src/components/WildcardForm.tsx` (§5)
- `src/components/icons.tsx` (logo gradient stays — it works on both backgrounds)
- `src/index.css` (body bg, scrollbars if styled)

### Mode-color soft backgrounds (`MODE_META` in `types.ts`)
The mode soft bgs (`bg-emerald-50/60` etc.) need dark equivalents. Two options:

- **Option A (chosen):** keep `MODE_META` Tailwind strings as single classes covering both modes, e.g. `bg-emerald-50/60 dark:bg-emerald-900/30`. This means each `MODE_META.softBg` string gets a `dark:` variant appended in-place. The components reading them don't change.
- Option B: split `MODE_META.softBg` into `softBgLight` / `softBgDark` — more typed, but every consumer must change.

We go with A — smaller blast radius.

### Tailwind safelist
None needed. All `dark:` variants are written literally in source.

---

## 3. Template search in sidebar

### `src/components/TemplateLibrary.tsx`
- Add `const [query, setQuery] = useState('')` (local state).
- Render a search `<input>` directly under the existing header (the block that says "Templates" + "Catalog from /templates.json …").
  - Placeholder: `"Search templates…"`
  - `className`: matches the form inputs already used elsewhere (`rounded-md border border-neutral-200 px-2 py-1 text-xs` plus `dark:` variants).
  - Small `×` clear button when non-empty.
- Filter the displayed list:
  ```ts
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q)
    );
  }, [templates, query]);
  ```
- When `templates.length > 0` but `filtered.length === 0`, render a "No matches" placeholder instead of the dashed-border "No templates" empty state.

### Out of scope
- Fuzzy search / tags. Substring on `name` and `description` is enough.

---

## 4. Export / import ElastiX state

### Wire format

```json
{
  "kind": "elastix-state",
  "version": 1,
  "exportedAt": "2026-05-24T12:34:56.789Z",
  "blocks": [ /* ModeBlock[] exactly as in store */ ]
}
```

- `kind` is the discriminator used by `import` to reject random JSON files (e.g. someone uploads a raw Elasticsearch query).
- `version` is independent of the zustand `persist` version (which is internal). Bump it if we ever change `ModeBlock` shape in a way that requires a migration during import.
- `exportedAt` is informational only.
- `blocks` includes nested bool items, `name` (user-given block labels), all leaf source kinds.

### Export flow
- Header button "Export" (download icon).
- Reads `useStore.getState().blocks`.
- Serializes the envelope with 2-space indentation.
- Creates a `Blob({ type: 'application/json' })` → `URL.createObjectURL` → `<a download="elastix-state-YYYY-MM-DD.json">` clicked programmatically → revoke object URL.
- No prompt. No state changes.

### Import flow
- Header button "Import" (upload icon).
- Triggers a hidden `<input type="file" accept=".json,application/json">` click.
- On change: read file via `text()`, `JSON.parse`, validate:
  - `data.kind === 'elastix-state'` (else show error toast / inline message)
  - `Array.isArray(data.blocks)` (else error)
  - Every block has a `string` id, valid `BoolMode`, and an `items` array. Loose validation: log and skip malformed items rather than reject the whole import.
- If current `blocks.length > 0`, show a confirm prompt: *"Replace the current builder with imported state? Your current blocks will be lost."* (Use `window.confirm` — no need to build a custom modal for this.)
- On confirm: new store action `replaceBlocks(blocks: ModeBlock[])` sets state.
- Reset the `<input>`'s value so the same file can be re-imported after a change.

### Store changes (`src/store.ts`)
- Add `replaceBlocks: (blocks: ModeBlock[]) => void` to the store.
- No persist-migrations needed — the import path validates and just calls `set({ blocks })`.

### Error surface
- Validation errors render as a transient banner under the header (or a `window.alert` as a fallback). Reuse the rose-200 styling already used for the templates error.

### Missing template references after import
Templates live in MongoDB / a ConfigMap, not in the exported state. An imported state may reference template IDs that don't exist on this deployment. Behavior:
- `buildQuery` already skips items whose `byId.get(templateId)` is undefined (returns no clause) — the query stays valid.
- `BuilderRow` for a template item must render gracefully when the template is missing — display the row with name `"missing template"` in muted/rose styling, keep the remove button working. Verify the current code path doesn't crash.

No additional migration is needed; the user can either delete the orphaned row or re-add the template to the catalog.

---

## 5. Wildcard block in the clause palette

### Type system (`src/types.ts`)
Extend `BuilderSource`:
```ts
| { kind: 'wildcard'; field: string; value: string }
```
`value` is the pattern, e.g. `"user.id"` field + `"abc*"` value → `{ wildcard: { "user.id": "abc*" } }`.

### Palette (`src/components/ModeBlockPalette.tsx`)
- Add to `LeafPaletteId`: `'wildcard'`.
- Add `LeafSpec` entry:
  - `id: 'wildcard'`, `kind: 'wildcard'`
  - `label: 'wildcard'`, `caption: 'pattern match (* / ?)'`
  - Glyph: `*` as a font-mono character, or a small SVG resembling `*?`.
  - Accent: `text-yellow-700`, ring `hover:ring-yellow-200`. Available — not used by other clauses.
  - `payload: { field: '', value: '' }`
- Slot it between `match` and `terms` so the order reads as `custom → timestamp → term → match → wildcard → terms → exists` (related text-matching clauses grouped).

### Form (`src/components/WildcardForm.tsx`)
Mirror `TermForm.tsx`. Two text inputs: `field` and `value (pattern)`. Save / Cancel buttons. Same row layout as the other forms.

### Store (`src/store.ts`)
Add:
- `addWildcardToBlock(blockId, { field, value }, atIndex?)`
- `updateWildcardItem(instanceId, { field?, value? })`

Model after `addTermToBlock` / `updateTermItem` exactly. No new helpers.

### Drag plumbing (`src/App.tsx`)
- Extend `PaletteLeafDrag` union with the wildcard variant.
- In `handleDragEnd` palette-leaf branch, add `leafKind === 'wildcard'` → `addWildcardToBlock(...)`.
- In `overlayContent` palette-leaf branch, add the wildcard case (detail: `field || 'configure…'`).

### Query building (`src/store.ts`, `buildQuery.resolve`)
Add:
```ts
if (item.source.kind === 'wildcard') {
  if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
  return { wildcard: { [item.source.field]: item.source.value } };
}
```

### Row rendering (`src/components/BuilderRow.tsx`)
Add a case for `source.kind === 'wildcard'` to display the field/value summary, identical pattern to `term` and `match`. Also route the row's edit click to the new `WildcardForm`.

---

## 6. Footer credit

### Header (`src/App.tsx` `Header` function)
- Remove the `<span>by yonka</span>` (the muted mono span next to "ElastiX").
- Keep everything else (logo, name, gradient bar, drag hint, header buttons).

### Footer
- Add a thin `<footer>` element inside the root `<div className="flex h-screen flex-col …">`, **after** the main content row, **before** the closing `</div>` of `DndContext`.
- Styling: 24px tall, `border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-5 py-1 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500`.
- Content: `by yonka`.

### Risk
- The app uses `h-screen` + flex column. Footer adds 24px → confirm the main area still scrolls correctly (it should — `flex-1 min-h-0` on the middle row).

---

## 7. "Open in Kibana" icon

### Current
A tiny external-link arrow SVG. Easy to miss against the button text.

### Change
Keep the button label "Open in Kibana" but swap the icon for a more recognizable mark. Two layered glyphs are overkill — use a single clean external-link icon at 14px with stronger stroke weight (`strokeWidth=2.25`), or substitute Lucide-style "arrow-up-right-from-square" (drawn inline, no extra dep).

Final pick (inline SVG, ~16px):
```
[ box with arrow exiting top-right ]
```
- Outer rounded rect (the destination)
- Arrow shaft going up-right and out of the rect

The icon sits to the **left** of the label. Color matches text (`text-emerald-700` light, `text-emerald-300` dark).

---

## 8. Production `/api/config` and `/api/count` in `server.js`

### Problem
`server.js` is currently static-only. The frontend's `loadConfig()` silently fails (its catch eats the error from a non-JSON response), so `config.kibanaUrl` and `config.ready` stay empty → both Header buttons stay disabled.

### Change
Port the `elasticDevApi` logic verbatim from `vite.config.ts` into `server.js`. The two implementations should be byte-for-byte the same in behavior; ideally we extract the handler into a shared module so they stay in sync.

#### Option A: Shared module (chosen)
Create `server/elasticApi.js` (plain ESM, no TS — it's runtime code on both Vite and Node):

```js
export function makeElasticHandlers(env) {
  // returns { handleConfig(req,res), handleCount(req,res), ready }
}
```

- `vite.config.ts` imports this module and adapts it into the existing `Plugin` shape.
- `server.js` imports this module and adds two new branches at the top of its request handler: `if (pathname === '/api/config') ... if (pathname === '/api/count') ...` before the static-file logic.

#### Option B: Copy/paste
Duplicate the handler body in `server.js`. Simpler diff, but two places to keep in sync.

We go with A because the handler is non-trivial (auth header construction, `_count` upstream call, error mapping) and silently drifting is a bigger risk than a small refactor.

### Env handling
`server.js` reads `process.env.*` directly. In production the container/orchestrator passes env vars; in dev `vite.config.ts` uses `loadEnv`. Both produce the same shape, so the shared module accepts a plain `env` object.

### Risk
- The shared module must be plain `.js` ESM (no TypeScript syntax) since `server.js` imports it without a build step. Mark this in the implementation plan.
- Vite's `loadEnv` returns strings only; `process.env.*` is also strings — same shape.

---

## 9. JSON preview popups (eye button)

### Goal
Let the user inspect the JSON for a single template, a single block, or a single template-row in the builder, without expanding the full Generated Query view.

### Trigger surfaces
Three places get a small eye button (`👁`-style SVG, 14px, ghost button):

1. **Template card in `TemplateLibrary`** — button in the top-right corner of each card. Click opens preview of `template.query`.
2. **Template-source row in `BuilderRow`** — button on rows whose `source.kind === 'template'`. Click opens preview of the resolved template query (looked up by `templateId` against the current templates list). For rows that are leaves (term, match, wildcard, etc.) the preview shows what that leaf compiles to (e.g. `{ term: { field: value } }`). For `bool` source rows, the eye opens the block-preview (same as the block header's button).
3. **Block header in `BlockCard`** — small eye button in the header chrome, next to the items-count chip. Click opens preview of just this block's contribution: `{ bool: { [mode]: [ ...resolved items ] } }`. Works for both top-level and nested blocks.

The Generated Query view at the top of the page already shows the full query — these popups are for inspecting one piece in isolation.

### Component contract — `src/components/JsonPreviewModal.tsx`

```ts
type Props = {
  open: boolean;
  title: string;
  value: unknown;        // serialized to JSON via JsonTree
  onClose: () => void;
};
```

- Centered fixed modal, ~520px wide, max-height 70vh, scrollable body.
- Backdrop: `bg-black/40 dark:bg-black/60`, click closes.
- Escape key closes.
- Header: `title` (left) + `×` close button (right).
- Body: `<JsonTree value={value} />` inside a scrollable container.
- Footer: optional "Copy JSON" button reusing the same clipboard logic as `QueryOutput`.
- Mounted at the root of `App.tsx`; the components that need to open it call a small context-based controller (next item).

### Modal controller — `src/utils/preview.tsx`

A tiny React context to avoid prop-drilling:

```ts
type PreviewState = { title: string; value: unknown } | null;
const PreviewContext = createContext<{ open: (title: string, value: unknown) => void; close: () => void }>(...);
export function PreviewProvider({ children }): JSX.Element; // owns the state, renders <JsonPreviewModal>
export function usePreview(): { open, close };
```

`App.tsx` wraps its tree in `<PreviewProvider>`. Buttons in `TemplateCard`, `BuilderRow`, and `BlockCard` call `usePreview().open(title, value)`.

### Preview content per surface

| Surface          | Title                                | Value                                                       |
| ---------------- | ------------------------------------ | ----------------------------------------------------------- |
| Template card    | `template.name`                      | `template.query`                                            |
| Template row     | `template.name`                      | `template.query` (resolved via `templatesById`)             |
| Leaf row (term…) | source kind, e.g. "term"             | the compiled leaf JSON (e.g. `{ term: { field: value } }`)  |
| Block header     | `displayName` (custom or mode label) | `{ bool: { [mode]: [...resolved items] } }` for this subtree |

For block previews, factor out the existing `buildQuery` `resolve` / `makeBoolInner` logic so a single-block JSON can be produced without rebuilding the whole tree. Add a small exported helper in `store.ts`:

```ts
export function buildBlockQuery(templates: Template[], block: ModeBlock): Record<string, unknown>;
```

For leaf-row previews, expose a parallel helper:

```ts
export function resolveItem(templates: Template[], item: BuilderItem): Record<string, unknown> | undefined;
```

These two helpers share their internals with `buildQuery` (no duplication).

### UX details
- The eye button is small enough not to interfere with drag handles. On `TemplateCard` and `BuilderRow`, `stopPropagation` on click so it doesn't trigger drag or row-edit.
- Disabled (greyed) when the value is `undefined` (e.g. a leaf row whose fields are still empty); tooltip "Nothing to preview yet".
- Reuses `JsonTree` from §1 — all collapse / syntax-coloring / dark-mode work is shared.

### Why a modal and not a popover
Popovers anchored to small buttons in dense lists get clipped, hidden behind scroll containers, and require careful focus management. A centered modal is simpler and works the same on every surface.

## Cross-cutting concerns

### Persistence and migrations
- Adding `kind: 'wildcard'` to the `BuilderSource` union is **additive** — the existing `persist` migration chain (v1 → v5 in `store.ts`) doesn't need a new version. Old persisted state has no wildcard items, and new wildcard items just round-trip.
- Adding `replaceBlocks` doesn't change persisted shape either.

### Theme initialization timing
- The first paint must already have the right `<html class="dark">` to avoid a flash. Inject a tiny inline script in `index.html` `<head>`:
  ```html
  <script>
    (function () {
      try {
        var v = localStorage.getItem('elastix-theme');
        var dark = v ? v === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        if (dark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  </script>
  ```
  Same script works for dev and prod (the prod server inlines `index.html` from disk; the script survives intact).

### Build & verification
- `npm run build` must pass (TypeScript + Vite build).
- `npm run dev` opens the app, the Generated Query area shows the JsonTree, collapse toggles work, dark mode toggles, template search filters, export downloads a file, import accepts that same file back, wildcard leaf drags into a block, footer shows "by yonka", Kibana button shows the new icon, with `.env` set the count + Kibana buttons are enabled.
- After `npm run build`, running `node server.js` (with env vars set) must produce a working `/api/config` and `/api/count`.

---

## File-level impact summary

**New files:**
- `src/components/JsonTree.tsx`
- `src/components/JsonPreviewModal.tsx`
- `src/components/WildcardForm.tsx`
- `src/utils/theme.ts`
- `src/utils/preview.tsx`
- `server/elasticApi.js` (project root — not bundled into the SPA)
- `docs/superpowers/specs/2026-05-24-elastix-improvements-design.md` (this file)

**Modified files (for §9 add: JSON preview button wiring):**
- `package.json` (remove `@monaco-editor/react`)
- `tailwind.config.js` (`darkMode: 'class'`)
- `index.html` (theme bootstrap script)
- `src/App.tsx` (header buttons, footer, dark variants, wildcard drag wiring)
- `src/types.ts` (`wildcard` source variant, `MODE_META` dark variants)
- `src/store.ts` (`addWildcardToBlock`, `updateWildcardItem`, `replaceBlocks`, `buildQuery` wildcard case)
- `src/components/QueryOutput.tsx` (replace Monaco with JsonTree, dark variants)
- `src/components/TemplateLibrary.tsx` (search, dark variants)
- `src/components/TemplateCard.tsx` (dark variants)
- `src/components/Builder.tsx` (dark variants)
- `src/components/BuilderRow.tsx` (wildcard case, dark variants)
- `src/components/BlockCard.tsx` (dark variants)
- `src/components/ModeBlockPalette.tsx` (wildcard leaf, dark variants)
- `src/components/CustomBlockForm.tsx` (dark variants)
- `src/components/TimestampRangeForm.tsx` (dark variants)
- `src/components/TermForm.tsx` (dark variants)
- `src/components/MatchForm.tsx` (dark variants)
- `src/components/TermsForm.tsx` (dark variants)
- `src/components/ExistsForm.tsx` (dark variants)
- `src/components/icons.tsx` (new Kibana icon)
- `src/index.css` (body dark bg)
- `server.js` (import shared elasticApi, mount /api/config + /api/count)
- `vite.config.ts` (use shared elasticApi)

## Open questions
None. All choices listed above were confirmed in the brainstorm.
