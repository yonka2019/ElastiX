# ElastiX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the 10 changes in `docs/superpowers/specs/2026-05-24-elastix-improvements-design.md` — offline JSON viewer, dark mode, template search, export/import state, wildcard clause, footer credit, Kibana icon, prod `/api/*`, JSON preview eye buttons.

**Architecture:** Frontend = Vite + React 18 + Tailwind 3 + zustand. New foundation components (`JsonTree`, `JsonPreviewModal`) are shared across features. Dark mode = Tailwind class strategy with a no-flash bootstrap script. Backend = thin Node static server (`server.js`) gets a shared `server/elasticApi.js` module so dev (Vite middleware) and prod (Node) share identical request handlers.

**Tech Stack:** React 18, TypeScript 5, Tailwind 3, Vite 5, zustand 4, @dnd-kit, plain Node http for prod.

**Verification approach:** The codebase has no test framework. We use:
1. `npm run build` — TypeScript compile + Vite production build. Must pass at every commit.
2. `npm run dev` — manual browser smoke tests per task using the acceptance criteria spelled out in each task's final step.
3. We do NOT introduce Vitest in this plan — that's a separate effort.

**Working directory:** `C:\Code\ElastiX`. Use PowerShell for shell commands (Windows). Where the plan shows `npm` commands, run them in the project root.

---

## Phase 0 — Tailwind config + no-flash theme bootstrap

### Task 0.1: Enable Tailwind class-based dark mode and inject theme bootstrap

**Files:**
- Modify: `tailwind.config.js`
- Modify: `index.html`

- [ ] **Step 1: Enable class-based dark mode in Tailwind**

Edit `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Add theme bootstrap script to `index.html`**

Insert the script in `<head>` immediately before `</head>`. This sets `<html class="dark">` synchronously based on `localStorage` or `prefers-color-scheme` so the first paint matches the user's preference (no flash):

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

- [ ] **Step 3: Verify build still passes**

Run: `npm run build`
Expected: completes with no errors.

- [ ] **Step 4: Commit**

```powershell
git add tailwind.config.js index.html
git commit -m "feat(theme): enable Tailwind dark mode + no-flash bootstrap"
```

---

## Phase 1 — JsonTree foundation

### Task 1.1: Create the `JsonTree` component

**Files:**
- Create: `src/components/JsonTree.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState, type ReactNode } from 'react';

type Props = { value: unknown };

export function JsonTree({ value }: Props) {
  return (
    <div className="font-mono text-[12px] leading-relaxed text-neutral-800 dark:text-neutral-200">
      <Node value={value} depth={0} isLast />
    </div>
  );
}

function Node({
  value,
  depth,
  isLast,
  keyLabel,
}: {
  value: unknown;
  depth: number;
  isLast: boolean;
  keyLabel?: string;
}) {
  const pad = { paddingLeft: depth * 12 };
  const comma = isLast ? '' : ',';

  if (value === null) return <Line pad={pad} keyLabel={keyLabel}><Null />{comma}</Line>;
  if (typeof value === 'boolean') return <Line pad={pad} keyLabel={keyLabel}><Bool v={value} />{comma}</Line>;
  if (typeof value === 'number') return <Line pad={pad} keyLabel={keyLabel}><Num v={value} />{comma}</Line>;
  if (typeof value === 'string') return <Line pad={pad} keyLabel={keyLabel}><Str v={value} />{comma}</Line>;
  if (Array.isArray(value)) return <ArrayNode arr={value} depth={depth} comma={comma} keyLabel={keyLabel} />;
  if (typeof value === 'object') return <ObjectNode obj={value as Record<string, unknown>} depth={depth} comma={comma} keyLabel={keyLabel} />;
  return <Line pad={pad} keyLabel={keyLabel}><span className="text-neutral-400">{String(value)}</span>{comma}</Line>;
}

function Line({ pad, keyLabel, children }: { pad: { paddingLeft: number }; keyLabel?: string; children: ReactNode }) {
  return (
    <div style={pad} className="whitespace-pre">
      {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
      {children}
    </div>
  );
}

function ObjectNode({
  obj,
  depth,
  comma,
  keyLabel,
}: {
  obj: Record<string, unknown>;
  depth: number;
  comma: string;
  keyLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const keys = Object.keys(obj);
  const empty = keys.length === 0;
  const pad = { paddingLeft: depth * 12 };

  if (empty) {
    return (
      <Line pad={pad} keyLabel={keyLabel}>
        <Punct>{'{}'}</Punct>{comma}
      </Line>
    );
  }

  return (
    <div>
      <div style={pad} className="flex items-start whitespace-pre">
        <Toggle open={open} onClick={() => setOpen((v) => !v)} />
        {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
        <Punct>{'{'}</Punct>
        {!open && (
          <span className="text-neutral-400 dark:text-neutral-500">
            {` … ${keys.length} ${keys.length === 1 ? 'key' : 'keys'} `}
            <Punct>{'}'}</Punct>
            {comma}
          </span>
        )}
      </div>
      {open && (
        <>
          {keys.map((k, i) => (
            <Node key={k} value={obj[k]} depth={depth + 1} isLast={i === keys.length - 1} keyLabel={k} />
          ))}
          <div style={pad} className="whitespace-pre">
            <Punct>{'}'}</Punct>{comma}
          </div>
        </>
      )}
    </div>
  );
}

function ArrayNode({
  arr,
  depth,
  comma,
  keyLabel,
}: {
  arr: unknown[];
  depth: number;
  comma: string;
  keyLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const empty = arr.length === 0;
  const pad = { paddingLeft: depth * 12 };

  if (empty) {
    return (
      <Line pad={pad} keyLabel={keyLabel}>
        <Punct>{'[]'}</Punct>{comma}
      </Line>
    );
  }

  return (
    <div>
      <div style={pad} className="flex items-start whitespace-pre">
        <Toggle open={open} onClick={() => setOpen((v) => !v)} />
        {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
        <Punct>{'['}</Punct>
        {!open && (
          <span className="text-neutral-400 dark:text-neutral-500">
            {` … ${arr.length} ${arr.length === 1 ? 'item' : 'items'} `}
            <Punct>{']'}</Punct>
            {comma}
          </span>
        )}
      </div>
      {open && (
        <>
          {arr.map((v, i) => (
            <Node key={i} value={v} depth={depth + 1} isLast={i === arr.length - 1} />
          ))}
          <div style={pad} className="whitespace-pre">
            <Punct>{']'}</Punct>{comma}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      aria-label={open ? 'Collapse' : 'Expand'}
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

function Key({ k }: { k: string }) {
  return <span className="text-sky-700 dark:text-sky-300">"{k}"</span>;
}
function Str({ v }: { v: string }) {
  return <span className="text-emerald-700 dark:text-emerald-300">"{v}"</span>;
}
function Num({ v }: { v: number }) {
  return <span className="text-amber-700 dark:text-amber-400">{v}</span>;
}
function Bool({ v }: { v: boolean }) {
  return <span className="text-rose-700 dark:text-rose-400">{String(v)}</span>;
}
function Null() {
  return <span className="text-rose-700 dark:text-rose-400">null</span>;
}
function Punct({ children }: { children: ReactNode }) {
  return <span className="text-neutral-500 dark:text-neutral-400">{children}</span>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npm run build`
Expected: completes with no errors. (The component isn't used yet — this just type-checks it.)

- [ ] **Step 3: Commit**

```powershell
git add src/components/JsonTree.tsx
git commit -m "feat(json): add collapsible JsonTree component"
```

---

## Phase 2 — Replace Monaco in QueryOutput

### Task 2.1: Swap Monaco for JsonTree in `QueryOutput`

**Files:**
- Modify: `src/components/QueryOutput.tsx`

- [ ] **Step 1: Replace the import and the editor block**

In `src/components/QueryOutput.tsx`:

Replace this import:
```tsx
import Editor from '@monaco-editor/react';
```
with:
```tsx
import { JsonTree } from './JsonTree';
```

Replace the entire `{expanded && (...)}` block at the bottom (the `<Editor ... />` element):

```tsx
      {expanded && (
        <div className="flex-1 min-h-0 overflow-auto bg-white px-4 py-3 dark:bg-neutral-950">
          <JsonTree value={built} />
        </div>
      )}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Smoke test in browser**

Run: `npm run dev` (or have it running).
Open the app. Expand "Generated Query". Verify:
- The JSON renders.
- Clicking the `▾` next to `{` collapses the object (shows `{ … N keys }`).
- Clicking the same toggle (now `▸`) expands again.
- Nested objects/arrays each have their own toggle.
- No CDN requests in DevTools Network tab (filter by `jsdelivr`).

- [ ] **Step 4: Commit**

```powershell
git add src/components/QueryOutput.tsx
git commit -m "feat(query-output): render JSON with JsonTree instead of Monaco"
```

### Task 2.2: Remove `@monaco-editor/react` dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto)

- [ ] **Step 1: Uninstall the package**

Run: `npm uninstall @monaco-editor/react`
Expected: package removed from `dependencies`, lockfile updated.

- [ ] **Step 2: Verify no stale imports**

Run: `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx | Select-String "@monaco-editor"`
Expected: no output (no imports remain).

If there are matches, fix them before continuing.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes, bundle is smaller.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore(deps): drop @monaco-editor/react (replaced by JsonTree)"
```

---

## Phase 3 — JsonPreviewModal + preview context

### Task 3.1: Create the `JsonPreviewModal` component

**Files:**
- Create: `src/components/JsonPreviewModal.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from 'react';
import { JsonTree } from './JsonTree';

type Props = {
  open: boolean;
  title: string;
  value: unknown;
  onClose: () => void;
};

export function JsonPreviewModal({ open, title, value, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      >
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </span>
          <button
            onClick={copy}
            className="ml-auto rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            {copied ? 'Copied ✓' : 'Copy JSON'}
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="flex-1 overflow-auto px-4 py-3">
          <JsonTree value={value} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```powershell
git add src/components/JsonPreviewModal.tsx
git commit -m "feat(preview): add JsonPreviewModal component"
```

### Task 3.2: Create the preview context

**Files:**
- Create: `src/utils/preview.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { JsonPreviewModal } from '../components/JsonPreviewModal';

type PreviewValue = { title: string; value: unknown } | null;

type Ctx = {
  open: (title: string, value: unknown) => void;
  close: () => void;
};

const PreviewContext = createContext<Ctx | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewValue>(null);

  const open = useCallback((title: string, value: unknown) => {
    setState({ title, value });
  }, []);
  const close = useCallback(() => setState(null), []);

  const ctx = useMemo<Ctx>(() => ({ open, close }), [open, close]);

  return (
    <PreviewContext.Provider value={ctx}>
      {children}
      <JsonPreviewModal
        open={state !== null}
        title={state?.title ?? ''}
        value={state?.value}
        onClose={close}
      />
    </PreviewContext.Provider>
  );
}

export function usePreview(): Ctx {
  const v = useContext(PreviewContext);
  if (!v) throw new Error('usePreview must be used inside <PreviewProvider>');
  return v;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```powershell
git add src/utils/preview.tsx
git commit -m "feat(preview): add PreviewProvider context"
```

### Task 3.3: Wire `PreviewProvider` into `App`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the provider**

At the top of `src/App.tsx`, add:

```tsx
import { PreviewProvider } from './utils/preview';
```

- [ ] **Step 2: Wrap the root**

Find the top-level `<DndContext ...>` element returned from `App`. Wrap its children inside a `<PreviewProvider>`. Simplest: wrap the entire returned JSX:

```tsx
  return (
    <PreviewProvider>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDrag(null);
          lastOverIdRef.current = null;
        }}
      >
        {/* ... existing body ... */}
      </DndContext>
    </PreviewProvider>
  );
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(preview): wrap App in PreviewProvider"
```

---

## Phase 4 — Dark mode wiring

### Task 4.1: Create `useTheme` hook

**Files:**
- Create: `src/utils/theme.ts`

- [ ] **Step 1: Create the file**

```ts
import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'elastix-theme';

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function useTheme(): { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    return readStored() ?? (systemPrefersDark() ? 'dark' : 'light');
  });

  // Apply on mount + on change so the DOM class is always in sync.
  useEffect(() => {
    apply(theme);
  }, [theme]);

  // Follow system changes only while the user hasn't made an explicit choice.
  useEffect(() => {
    if (readStored() !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, toggle, setTheme };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```powershell
git add src/utils/theme.ts
git commit -m "feat(theme): add useTheme hook"
```

### Task 4.2: Add dark mode toggle button to `Header`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import the hook**

At the top of `src/App.tsx`:
```tsx
import { useTheme } from './utils/theme';
```

- [ ] **Step 2: Add the toggle in the `Header` function**

Inside `function Header()`, before the `openInKibana` const, add:
```tsx
  const { theme, toggle } = useTheme();
```

Inside the `<div className="ml-auto flex items-center gap-2">` block at the end of the header, **before** the existing "Open in Kibana" button, insert:

```tsx
        <button
          onClick={toggle}
          className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Smoke test**

`npm run dev`. Click the new sun/moon button. The `<html>` element should toggle a `dark` class (verify in DevTools elements panel). The button icon should swap between sun and moon. Reload — the choice persists.

- [ ] **Step 5: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(theme): add header sun/moon toggle"
```

### Task 4.3: Add `dark:` variants — root, `index.css`, `MODE_META`

**Files:**
- Modify: `src/index.css`
- Modify: `src/types.ts`
- Modify: `src/App.tsx`

The strategy is **additive**: keep existing light classes, append `dark:` equivalents on the same elements. Backgrounds: `bg-white` → also `dark:bg-neutral-900`. Bordering: `border-neutral-200` → also `dark:border-neutral-700`. Text: `text-neutral-900` → also `dark:text-neutral-100`; `text-neutral-500` → also `dark:text-neutral-400`. Mode soft bgs get a dark complement at 30% opacity on the same hue.

- [ ] **Step 1: Update `src/index.css`**

Replace the file body with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  margin: 0;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background: #fafafa;
  color: #111;
  -webkit-font-smoothing: antialiased;
}

html.dark body {
  background: #0a0a0a;
  color: #e5e5e5;
}

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: #d4d4d4;
  border-radius: 4px;
}
::-webkit-scrollbar-thumb:hover { background: #a3a3a3; }

html.dark ::-webkit-scrollbar-thumb { background: #404040; }
html.dark ::-webkit-scrollbar-thumb:hover { background: #525252; }

@keyframes drop-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.drop-in { animation: drop-in 180ms ease-out both; }

@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0   rgba(37, 99, 235, 0.35); }
  100% { box-shadow: 0 0 0 12px rgba(37, 99, 235, 0); }
}
.pulse-ring { animation: pulse-ring 1.1s ease-out infinite; }
```

- [ ] **Step 2: Update `MODE_META` soft variants in `src/types.ts`**

For each of the three modes, append `dark:` variants to the relevant fields. Final values (replace the existing literals in `MODE_META`):

`must` — `chip`: `'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'`
`must` — `softBg`: `'bg-emerald-50/60 dark:bg-emerald-950/40'`
`must` — `softBgStrong`: `'bg-emerald-100/60 dark:bg-emerald-900/40'`
`must` — `softBorder`: `'border-emerald-200 dark:border-emerald-800'`
`must` — `softRing`: `'ring-emerald-300 dark:ring-emerald-700'`
`must` — `accentText`: `'text-emerald-700 dark:text-emerald-300'`
`must` — `headerText`: `'text-emerald-900 dark:text-emerald-100'`

`should` — same pattern with `sky-*` instead of `emerald-*`:
- `chip`: `'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800'`
- `softBg`: `'bg-sky-50/60 dark:bg-sky-950/40'`
- `softBgStrong`: `'bg-sky-100/60 dark:bg-sky-900/40'`
- `softBorder`: `'border-sky-200 dark:border-sky-800'`
- `softRing`: `'ring-sky-300 dark:ring-sky-700'`
- `accentText`: `'text-sky-700 dark:text-sky-300'`
- `headerText`: `'text-sky-900 dark:text-sky-100'`

`must_not` — same pattern with `rose-*`:
- `chip`: `'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800'`
- `softBg`: `'bg-rose-50/60 dark:bg-rose-950/40'`
- `softBgStrong`: `'bg-rose-100/60 dark:bg-rose-900/40'`
- `softBorder`: `'border-rose-200 dark:border-rose-800'`
- `softRing`: `'ring-rose-300 dark:ring-rose-700'`
- `accentText`: `'text-rose-700 dark:text-rose-300'`
- `headerText`: `'text-rose-900 dark:text-rose-100'`

(`label`, `word`, `sentence`, `dot`, `bar`, `headerSolid`, `blockShadow` stay unchanged — solid colors work on either background.)

- [ ] **Step 3: Update root background in `App.tsx`**

Find this line in `App.tsx`:
```tsx
      <div className="flex h-screen flex-col bg-neutral-50">
```
Change to:
```tsx
      <div className="flex h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
```

Find this header line:
```tsx
    <header className="relative flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3">
```
Change to:
```tsx
    <header className="relative flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
```

Find:
```tsx
        <span className="text-base font-semibold text-neutral-900">ElastiX</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          by yonka
        </span>
```
Change the ElastiX span class to `text-base font-semibold text-neutral-900 dark:text-neutral-100`. The `by yonka` will be removed in Task 9.2 — leave it for now.

Find the drag-hint span:
```tsx
      <div className="hidden text-xs text-neutral-500 sm:block">
```
Change to:
```tsx
      <div className="hidden text-xs text-neutral-500 sm:block dark:text-neutral-400">
```

Find the "Open in Kibana" button class — append `dark:` variants:
- Original: `inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white`
- Add at the end: ` dark:border-emerald-800 dark:bg-neutral-900 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950 dark:disabled:border-neutral-700 dark:disabled:text-neutral-500 dark:disabled:hover:bg-neutral-900`

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Smoke test**

`npm run dev`. Toggle dark mode. The page background should darken; the header should be `neutral-900`; chips for `must`/`should`/`must_not` should switch to dark variants. The Open in Kibana button should stay readable.

- [ ] **Step 6: Commit**

```powershell
git add src/index.css src/types.ts src/App.tsx
git commit -m "feat(theme): dark variants for root, mode meta, header"
```

### Task 4.4: Dark variants in `QueryOutput`, `Builder`, `ModeBlockPalette`

**Files:**
- Modify: `src/components/QueryOutput.tsx`
- Modify: `src/components/Builder.tsx`
- Modify: `src/components/ModeBlockPalette.tsx`

- [ ] **Step 1: `QueryOutput.tsx`**

Open `src/components/QueryOutput.tsx`. Add `dark:` variants on the following spots (search the file for the exact light-mode strings and append):

| Element                    | Append                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| Section wrapper            | `dark:border-neutral-800 dark:bg-neutral-900`                                                     |
| Header click target div    | `dark:border-blue-900 dark:from-sky-950 dark:via-blue-950 dark:to-indigo-950 dark:hover:from-sky-900 dark:hover:via-blue-900 dark:hover:to-indigo-900` |
| Toggle button (the chevron)| `dark:text-blue-300 dark:hover:bg-blue-900`                                                       |
| "Generated Query" span     | `dark:text-blue-100`                                                                              |
| "click to expand" span     | `dark:text-blue-300/80`                                                                           |
| `empty → match_all` span   | `dark:text-neutral-400`                                                                           |
| Doc-count chip (emerald)   | `dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300`                               |
| Error chip (rose)          | `dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300`                                        |
| "Count docs" button        | `dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-900 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500` |
| "Copy JSON" button         | `dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300 dark:hover:border-blue-700 dark:hover:bg-blue-900` |

- [ ] **Step 2: `Builder.tsx`**

Read `src/components/Builder.tsx`, then for each `bg-white`, `bg-neutral-50`, `bg-blue-50`, `border-neutral-200`, `text-neutral-900`, `text-neutral-500`, append the dark variants per the table below:

| Light                  | Dark                              |
| ---------------------- | --------------------------------- |
| `bg-white`             | `dark:bg-neutral-900`             |
| `bg-neutral-50`        | `dark:bg-neutral-950`             |
| `bg-blue-50`           | `dark:bg-blue-950`                |
| `bg-blue-100`          | `dark:bg-blue-900`                |
| `border-neutral-200`   | `dark:border-neutral-800`         |
| `border-blue-200`      | `dark:border-blue-800`            |
| `text-neutral-900`     | `dark:text-neutral-100`           |
| `text-neutral-500`     | `dark:text-neutral-400`           |
| `text-neutral-400`     | `dark:text-neutral-500`           |
| `text-blue-700`        | `dark:text-blue-300`              |

This rule-table applies to every file in this and the next tasks — keep it open as a reference.

- [ ] **Step 3: `ModeBlockPalette.tsx`**

Apply the same translation table to all neutral and palette-color literals. Pay attention to `LeafSpec.ring` (`hover:ring-*-200`) — these stay light-only; add dark equivalents like `dark:hover:ring-indigo-800`.

For each leaf accent (`text-indigo-700`, `text-amber-700`, `text-purple-700`, `text-rose-700`, `text-fuchsia-700`, `text-teal-700`), append `dark:text-*-300` of the matching hue.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Smoke test**

`npm run dev` → dark mode. Verify QueryOutput, the builder canvas, and the left palette all read correctly. Drag a few blocks around.

- [ ] **Step 6: Commit**

```powershell
git add src/components/QueryOutput.tsx src/components/Builder.tsx src/components/ModeBlockPalette.tsx
git commit -m "feat(theme): dark variants for QueryOutput, Builder, palette"
```

### Task 4.5: Dark variants in `BlockCard`, `BuilderRow`, `TemplateLibrary`, `TemplateCard`

**Files:**
- Modify: `src/components/BlockCard.tsx`
- Modify: `src/components/BuilderRow.tsx`
- Modify: `src/components/TemplateLibrary.tsx`
- Modify: `src/components/TemplateCard.tsx`

- [ ] **Step 1: Apply the translation table to all four files**

Same table as Task 4.4 Step 2. Specifically:

- `BlockCard.tsx`: `bg-white` on the `<section>` → `dark:bg-neutral-900`. The dashed empty placeholder's `bg-white/60` → `dark:bg-neutral-900/60`. The drop-hint at the bottom: `bg-white/60` → `dark:bg-neutral-900/60`. Drop targets ring `border-blue-500 ring-2 ring-blue-200` → also add `dark:border-blue-500 dark:ring-blue-800`.
- `BuilderRow.tsx`: row container `bg-white` → `dark:bg-neutral-900`, `hover:border-neutral-300` → `dark:hover:border-neutral-700`, all the per-leaf chips (template/custom/timestamp/term/match/wildcard/terms/exists) get `dark:bg-*-950 dark:text-*-300 dark:border-*-800` of their hue. The "missing template" rose styling: `bg-rose-50 border-rose-300 text-rose-700` → also `dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300`. The edit (✎) and remove (×) buttons' hover bg: `hover:bg-neutral-100` → also `dark:hover:bg-neutral-800`; `hover:bg-rose-50 hover:text-rose-600` → also `dark:hover:bg-rose-950 dark:hover:text-rose-400`.
- `TemplateLibrary.tsx`: aside `bg-white` → `dark:bg-neutral-900`; borders, headings.
- `TemplateCard.tsx`: card `bg-white` → `dark:bg-neutral-900`; `border-neutral-200` → `dark:border-neutral-800`; name text → `dark:text-neutral-100`; description text → `dark:text-neutral-400`; the blue icon stays.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Smoke test in dark mode**

Drop a template into a block, nest a `should` block inside `must`, ensure all colors read correctly.

- [ ] **Step 4: Commit**

```powershell
git add src/components/BlockCard.tsx src/components/BuilderRow.tsx src/components/TemplateLibrary.tsx src/components/TemplateCard.tsx
git commit -m "feat(theme): dark variants for blocks, rows, template sidebar"
```

### Task 4.6: Dark variants in all clause forms

**Files:**
- Modify: `src/components/CustomBlockForm.tsx`
- Modify: `src/components/TimestampRangeForm.tsx`
- Modify: `src/components/TermForm.tsx`
- Modify: `src/components/MatchForm.tsx`
- Modify: `src/components/TermsForm.tsx`
- Modify: `src/components/ExistsForm.tsx`

- [ ] **Step 1: Apply the translation table to each form**

Each form is structured similarly: an outer wrapper using `meta.softBorder` and `meta.softBg` (already dark-aware after Task 4.3), labels in `text-neutral-500`, inputs with `bg-white border-neutral-300`, a "will save as" preview box with `bg-white/60 border-neutral-200`, and Save/Cancel buttons.

Apply on each form:
- Labels: `text-neutral-500` → also `dark:text-neutral-400`
- Inputs: `bg-white border-neutral-300 focus:border-neutral-500` → also `dark:bg-neutral-800 dark:border-neutral-700 dark:focus:border-neutral-500 dark:text-neutral-100`
- Preview box: `bg-white/60 border-neutral-200 text-neutral-600` → also `dark:bg-neutral-900/60 dark:border-neutral-700 dark:text-neutral-300`. Inner `.text-neutral-400` label → also `dark:text-neutral-500`.
- Cancel button: `bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-100` → also `dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700`
- Save button: `bg-neutral-900 text-white hover:bg-neutral-800 disabled:bg-neutral-300` → also `dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500`

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Smoke test**

Open each form in dark mode (drag a clause from the palette, click ✎ on existing rows). Verify inputs are readable, preview box is readable, buttons contrast.

- [ ] **Step 4: Commit**

```powershell
git add src/components/CustomBlockForm.tsx src/components/TimestampRangeForm.tsx src/components/TermForm.tsx src/components/MatchForm.tsx src/components/TermsForm.tsx src/components/ExistsForm.tsx
git commit -m "feat(theme): dark variants for all clause forms"
```

---

## Phase 5 — Template search

### Task 5.1: Add search input to `TemplateLibrary`

**Files:**
- Modify: `src/components/TemplateLibrary.tsx`

- [ ] **Step 1: Add state and filtering**

In `TemplateLibrary`, replace the existing function body:

```tsx
export function TemplateLibrary({ activeDragId }: Props) {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const templatesLoading = useStore((s) => s.templatesLoading);
  const templatesError = useStore((s) => s.templatesError);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      if (t.name.toLowerCase().includes(q)) return true;
      if ((t.description ?? '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [templates, query]);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Templates</div>
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Catalog from <span className="font-mono">/templates.json</span> — drag onto the builder
        </div>
        <div className="relative mt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            spellCheck={false}
            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 pr-7 text-xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
              aria-label="Clear search"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {templatesError && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <div className="font-semibold">Couldn't load templates.json</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-rose-600/80 dark:text-rose-400/80">{templatesError}</div>
            <button
              onClick={() => void loadTemplates()}
              className="mt-1.5 rounded border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-neutral-900 dark:text-rose-300 dark:hover:bg-rose-950"
            >
              Retry
            </button>
          </div>
        )}
        {templatesLoading && templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No templates in the catalog.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            No templates match "{query}".
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((t) => (
              <LibraryItem
                key={t.id}
                template={t}
                isDragging={activeDragId === `tpl:${t.id}`}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Add the imports at the top of the file**

Replace the existing imports with:
```tsx
import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { TemplateCard } from './TemplateCard';
import type { Template } from '../types';
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Smoke test**

`npm run dev`. Type into the search field — list filters live. Click `×` — list resets. Type a query that matches nothing — "No templates match …" appears.

- [ ] **Step 5: Commit**

```powershell
git add src/components/TemplateLibrary.tsx
git commit -m "feat(templates): add search input to library sidebar"
```

---

## Phase 6 — Wildcard clause

### Task 6.1: Add `wildcard` to type, store, and query builder

**Files:**
- Modify: `src/types.ts`
- Modify: `src/store.ts`

- [ ] **Step 1: Extend `BuilderSource` in `src/types.ts`**

In the `BuilderSource` union, add a new variant. The final union (look for the existing one and insert the wildcard line after the `terms` line, before the `exists` line):

```ts
export type BuilderSource =
  | { kind: 'template'; templateId: string }
  | { kind: 'custom'; name: string; query: Record<string, unknown> }
  | { kind: 'timestamp'; field: string; gte?: string; lte?: string }
  | { kind: 'term'; field: string; value: string }
  | { kind: 'match'; field: string; value: string }
  | { kind: 'terms'; field: string; values: string[] }
  | { kind: 'wildcard'; field: string; value: string }
  | { kind: 'exists'; field: string }
  | { kind: 'bool'; block: ModeBlock };
```

- [ ] **Step 2: Add store actions in `src/store.ts`**

In the `StoreState` type, after `addExistsToBlock`, add:
```ts
  addWildcardToBlock: (
    blockId: string,
    payload: { field: string; value: string },
    atIndex?: number
  ) => string | null;
  updateWildcardItem: (instanceId: string, patch: { field?: string; value?: string }) => void;
```

In the store implementation (after `addExistsToBlock` near line 392), add:
```ts
      addWildcardToBlock: (blockId, { field, value }, atIndex) => {
        const instanceId = uuidv4();
        let added = false;
        set((s) => ({
          blocks: updateBlockById(s.blocks, blockId, (b) => {
            added = true;
            const item: BuilderItem = {
              instanceId,
              source: { kind: 'wildcard', field, value },
            };
            return { ...b, items: insertAt(b.items, item, atIndex) };
          }),
        }));
        return added ? instanceId : null;
      },
```

After `updateExistsItem` (around line 533) add:
```ts
      updateWildcardItem: (instanceId, patch) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          return {
            blocks: updateBlockById(s.blocks, loc.parentBlockId, (b) => {
              const idx = b.items.findIndex((x) => x.instanceId === instanceId);
              if (idx < 0) return b;
              const existing = b.items[idx];
              if (existing.source.kind !== 'wildcard') return b;
              const items = [...b.items];
              items[idx] = {
                ...existing,
                source: {
                  kind: 'wildcard',
                  field: patch.field ?? existing.source.field,
                  value: patch.value ?? existing.source.value,
                },
              };
              return { ...b, items };
            }),
          };
        });
      },
```

- [ ] **Step 3: Extend `buildQuery.resolve` in `src/store.ts`**

In the `resolve` function (around line 750-780), after the `exists` case and before the bool-fall-through, add:
```ts
    if (item.source.kind === 'wildcard') {
      if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
      return { wildcard: { [item.source.field]: item.source.value } };
    }
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes. (TypeScript will catch any missing case in unions.)

- [ ] **Step 5: Commit**

```powershell
git add src/types.ts src/store.ts
git commit -m "feat(wildcard): add wildcard source variant + store + builder"
```

### Task 6.2: Create `WildcardForm`

**Files:**
- Create: `src/components/WildcardForm.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { useState } from 'react';
import type { BoolMode } from '../types';
import { MODE_META } from '../types';

type Props = {
  sectionMode: BoolMode;
  initialField: string;
  initialValue: string;
  onSubmit: (patch: { field: string; value: string }) => void;
  onCancel: () => void;
};

export function WildcardForm({ sectionMode, initialField, initialValue, onSubmit, onCancel }: Props) {
  const meta = MODE_META[sectionMode];
  const [field, setField] = useState(initialField);
  const [value, setValue] = useState(initialValue);
  const canSave = field.trim().length > 0 && value.trim().length > 0;

  return (
    <div className={`rounded-md border-2 border-dashed ${meta.softBorder} ${meta.softBg} p-3`}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-neutral-900 ${meta.accentText} ${meta.softBorder}`}
        >
          * wildcard (pattern *, ?) in {meta.label}
        </span>
      </div>

      <label className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Field
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        value={field}
        onChange={(e) => setField(e.target.value)}
        placeholder="field.name"
        spellCheck={false}
      />

      <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        Pattern (use * and ?)
      </label>
      <input
        className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 font-mono text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="abc*"
        spellCheck={false}
      />

      <div className="mt-2 rounded-md border border-neutral-200 bg-white/60 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
        <div className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          will save as
        </div>
        <div className="break-all">{`{ "wildcard": { "${field.trim() || '…'}": "${value.trim() || '…'}" } }`}</div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Cancel
        </button>
        <button
          onClick={() => canSave && onSubmit({ field: field.trim(), value: value.trim() })}
          disabled={!canSave}
          className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
        >
          Save wildcard
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Commit**

```powershell
git add src/components/WildcardForm.tsx
git commit -m "feat(wildcard): add WildcardForm component"
```

### Task 6.3: Add wildcard leaf to `ModeBlockPalette` + drag wiring in `App`

**Files:**
- Modify: `src/components/ModeBlockPalette.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Extend `LeafPaletteId` and `LeafSpec` in `ModeBlockPalette.tsx`**

Replace the `LeafPaletteId` export with:
```ts
export type LeafPaletteId =
  | 'custom'
  | 'timestamp-range'
  | 'term'
  | 'match'
  | 'wildcard'
  | 'terms'
  | 'exists';
```

In the `LeafSpec` union, add a wildcard variant after `match` and before `terms`:
```ts
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
```

Add the glyph constant alongside the other glyphs:
```tsx
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
```

In `LEAF_PALETTE` array, insert (between the `match` entry and the `terms` entry):
```ts
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
```

- [ ] **Step 2: Extend drag types in `App.tsx`**

In the `PaletteLeafDrag` union, insert (next to `match`):
```ts
  | {
      kind: 'palette-leaf';
      leafId: 'wildcard';
      leafKind: 'wildcard';
      payload: { field: string; value: string };
    }
```

- [ ] **Step 3: Wire `addWildcardToBlock` in `handleDragEnd`**

In `App.tsx`, find the `handleDragEnd` palette-leaf branch (the `addAt` closure). Pull `addWildcardToBlock` from the store with the other `addX` actions at the top of the component:
```tsx
  const addWildcardToBlock = useStore((s) => s.addWildcardToBlock);
```

In the `addAt` function, before the `if (activeData.leafKind === 'terms')` line, add:
```ts
        if (activeData.leafKind === 'wildcard') {
          return addWildcardToBlock(blockId, activeData.payload, atIndex);
        }
```

- [ ] **Step 4: Add wildcard to the drag-overlay**

In `App.tsx` `overlayContent` palette-leaf branch, find the chain of `else if (activeDrag.leafKind === 'X')`. After the `match` case and before `terms`, add:
```ts
      } else if (activeDrag.leafKind === 'wildcard') {
        detail = activeDrag.payload.field || 'configure…';
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 6: Smoke test**

`npm run dev`. A new `wildcard` card appears in the left palette between `match` and `terms`. Dragging it onto a block adds the item and opens the (still-default) form. The form may be the wrong type until Task 6.4 — for now just verify the drag adds a wildcard-source row to the block.

- [ ] **Step 7: Commit**

```powershell
git add src/components/ModeBlockPalette.tsx src/App.tsx
git commit -m "feat(wildcard): add palette leaf + drag wiring"
```

### Task 6.4: Render and edit wildcard rows in `BuilderRow`

**Files:**
- Modify: `src/components/BuilderRow.tsx`

- [ ] **Step 1: Import the new form**

Add to the existing imports at the top:
```tsx
import { WildcardForm } from './WildcardForm';
```

- [ ] **Step 2: Add a store update reference**

Inside the component, alongside the other `update*Item` references:
```tsx
  const updateWildcardItem = useStore((s) => s.updateWildcardItem);
```

- [ ] **Step 3: Add the edit branch for wildcard**

After the `editing && item.source.kind === 'match'` block and before the `terms` block, add:
```tsx
  if (editing && item.source.kind === 'wildcard') {
    return (
      <div ref={setNodeRef} style={style} className="drop-in">
        <WildcardForm
          sectionMode={sectionMode}
          initialField={item.source.field}
          initialValue={item.source.value}
          onSubmit={(patch) => {
            updateWildcardItem(item.instanceId, patch);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }
```

- [ ] **Step 4: Add `isWildcard` to the display branch**

Near the `isCustom`, `isTimestamp`, etc. flags, add:
```tsx
  const isWildcard = item.source.kind === 'wildcard';
```

Update `editable`:
```tsx
  const editable = isCustom || isTimestamp || isTerm || isMatch || isWildcard || isTerms || isExists;
```

In the `else if`/`else if` chain for `label`/`description`/`queryPreview`, after the `match` branch and before the `terms` branch, add:
```ts
  } else if (item.source.kind === 'wildcard') {
    label = item.source.field || '(unset)';
    description = item.source.value ? `~ ${item.source.value}` : 'no pattern';
    queryPreview = JSON.stringify({ wildcard: { [item.source.field || '_field']: item.source.value } });
```

In the badges block (the row of `{isTerm && ...}`, `{isMatch && ...}` chips), add after `{isMatch && ...}` and before `{isTerms && ...}`:
```tsx
          {isWildcard && (
            <span
              className="inline-flex items-center gap-1 rounded border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 font-mono text-[10px] text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"
              title="Wildcard pattern query"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 4v16" />
                <path d="M5.5 7.5l13 9" />
                <path d="M5.5 16.5l13 -9" />
              </svg>
              wildcard
            </span>
          )}
```

Update `editLabel`:
```ts
  const editLabel = isTimestamp
    ? 'Configure range'
    : isTerm
    ? 'Configure term'
    : isMatch
    ? 'Configure match'
    : isWildcard
    ? 'Configure wildcard'
    : isTerms
    ? 'Configure terms'
    : isExists
    ? 'Configure exists'
    : 'Edit custom block in place';
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 6: Smoke test**

`npm run dev`. Drag a `wildcard` from palette into a block → form opens automatically (because of `pendingEditId`). Enter `host.name` field and `prod-*` value → Save. The row should show `host.name` + `~ prod-*` + yellow `wildcard` chip. Expand Generated Query — it includes `{ "wildcard": { "host.name": "prod-*" } }`.

- [ ] **Step 7: Commit**

```powershell
git add src/components/BuilderRow.tsx
git commit -m "feat(wildcard): render and edit wildcard rows"
```

---

## Phase 7 — Export / import builder state

### Task 7.1: Add `replaceBlocks` action

**Files:**
- Modify: `src/store.ts`

- [ ] **Step 1: Add to `StoreState` type**

In the `StoreState` type definition, add a line near `clearBuilder`:
```ts
  replaceBlocks: (blocks: ModeBlock[]) => void;
```

- [ ] **Step 2: Add to the store implementation**

In the store factory body, near the existing `clearBuilder: () => set({ blocks: [] })`, add:
```ts
      replaceBlocks: (blocks) => set({ blocks }),
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Commit**

```powershell
git add src/store.ts
git commit -m "feat(io): add replaceBlocks store action"
```

### Task 7.2: Add Export / Import buttons to `Header`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Pull required state in `Header`**

In `function Header()`, add:
```tsx
  const blocks = useStore((s) => s.blocks);
  const replaceBlocks = useStore((s) => s.replaceBlocks);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ioError, setIoError] = useState<string | null>(null);
```

And import `useRef` and `useState` from React (alongside existing imports). The existing `App.tsx` already imports `useState`, just make sure both are present in the top import line:
```tsx
import { useEffect, useRef, useState } from 'react';
```

- [ ] **Step 2: Add the export handler in `Header`**

```tsx
  const exportState = () => {
    const payload = {
      kind: 'elastix-state' as const,
      version: 1,
      exportedAt: new Date().toISOString(),
      blocks,
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `elastix-state-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
```

- [ ] **Step 3: Add the import handler in `Header`**

```tsx
  const importState = async (file: File) => {
    setIoError(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        kind?: string;
        blocks?: unknown;
      };
      if (data.kind !== 'elastix-state') {
        setIoError('File is not an ElastiX state export.');
        return;
      }
      if (!Array.isArray(data.blocks)) {
        setIoError('Export is malformed: "blocks" must be an array.');
        return;
      }
      if (blocks.length > 0) {
        const ok = window.confirm(
          'Replace the current builder with imported state? Your current blocks will be lost.'
        );
        if (!ok) return;
      }
      replaceBlocks(data.blocks as ModeBlock[]);
    } catch (err) {
      setIoError(`Failed to import: ${(err as Error).message}`);
    }
  };
```

Add this import at the top of `App.tsx`:
```tsx
import type { BoolMode, ModeBlock } from './types';
```
(The file currently imports `BoolMode` only. Replace that import.)

- [ ] **Step 4: Add the buttons**

In the header's `<div className="ml-auto flex items-center gap-2">` block, insert (between the theme toggle button and the "Open in Kibana" button):

```tsx
        <button
          onClick={exportState}
          disabled={blocks.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:disabled:text-neutral-500"
          title="Download the current builder state as JSON"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
          title="Load builder state from a JSON file"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21V9" />
            <path d="M7 14l5-5 5 5" />
            <path d="M5 3h14" />
          </svg>
          Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importState(f);
            e.target.value = '';
          }}
        />
```

- [ ] **Step 5: Add the error banner**

In `App.tsx`, after the closing `</header>` of `Header`, render the banner. Since the error state lives in `Header`, the cleanest path is to render the banner inside `Header` itself. After the closing `</div>` of the `ml-auto` flex block and before the `</header>`, you can't easily place it; instead make `Header` render a fragment containing both the header and an optional banner. Replace `return ( <header>...</header> )` with:

```tsx
  return (
    <>
      <header className="relative flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        {/* existing header body unchanged */}
      </header>
      {ioError && (
        <div className="flex shrink-0 items-center gap-3 border-b border-rose-300 bg-rose-50 px-5 py-1.5 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <span className="font-semibold">Import error:</span>
          <span className="truncate">{ioError}</span>
          <button
            onClick={() => setIoError(null)}
            className="ml-auto rounded p-0.5 hover:bg-rose-100 dark:hover:bg-rose-900"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 7: Smoke test**

`npm run dev`. Create a few blocks and items, including a renamed block. Click Export — a file downloads. Click Import → select the same file → confirm prompt → blocks restore identically. Try importing a non-JSON file → error banner.

- [ ] **Step 8: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(io): export/import builder state via header buttons"
```

---

## Phase 8 — JSON preview eye buttons

### Task 8.1: Extract `resolveItem` and `buildBlockQuery` helpers

**Files:**
- Modify: `src/store.ts`

The current `buildQuery` has an inner `resolve` and `makeBoolInner`. We want them exposed as standalone helpers so the preview popups can ask "what does THIS block compile to?" without recomputing the whole tree.

- [ ] **Step 1: Refactor `buildQuery` to delegate to module-scope helpers**

Replace the `buildQuery` function (top-level export near the bottom of `store.ts`) and add two new exports:

```ts
export function resolveItem(
  templates: Template[],
  item: BuilderItem
): Record<string, unknown> | undefined {
  const byId = new Map(templates.map((t) => [t.id, t]));
  return resolveItemWithMap(byId, item);
}

export function buildBlockQuery(
  templates: Template[],
  block: ModeBlock
): Record<string, unknown> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inner = makeBoolInnerWithMap(byId, [block]);
  return { bool: inner };
}

function resolveItemWithMap(
  byId: Map<string, Template>,
  item: BuilderItem
): Record<string, unknown> | undefined {
  if (item.source.kind === 'template') return byId.get(item.source.templateId)?.query;
  if (item.source.kind === 'custom') return item.source.query;
  if (item.source.kind === 'timestamp') {
    const bounds: Record<string, unknown> = {};
    if (item.source.gte) bounds.gte = item.source.gte;
    if (item.source.lte) bounds.lte = item.source.lte;
    if (Object.keys(bounds).length === 0) return undefined;
    return { range: { [item.source.field]: bounds } };
  }
  if (item.source.kind === 'term') {
    if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
    return { term: { [item.source.field]: item.source.value } };
  }
  if (item.source.kind === 'match') {
    if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
    return { match: { [item.source.field]: item.source.value } };
  }
  if (item.source.kind === 'wildcard') {
    if (!item.source.field.trim() || !item.source.value.trim()) return undefined;
    return { wildcard: { [item.source.field]: item.source.value } };
  }
  if (item.source.kind === 'terms') {
    const cleaned = item.source.values.map((v) => v.trim()).filter(Boolean);
    if (!item.source.field.trim() || cleaned.length === 0) return undefined;
    return { terms: { [item.source.field]: cleaned } };
  }
  if (item.source.kind === 'exists') {
    if (!item.source.field.trim()) return undefined;
    return { exists: { field: item.source.field } };
  }
  const inner = makeBoolInnerWithMap(byId, [item.source.block]);
  if (Object.keys(inner).length === 0) return undefined;
  return { bool: inner };
}

function makeBoolInnerWithMap(
  byId: Map<string, Template>,
  bs: ModeBlock[]
): Record<string, unknown> {
  const buckets: Record<BoolMode, Array<Record<string, unknown>>> = {
    must: [],
    should: [],
    must_not: [],
  };
  for (const block of bs) {
    for (const item of block.items) {
      const q = resolveItemWithMap(byId, item);
      if (q) buckets[block.mode].push(q);
    }
  }
  const out: Record<string, unknown> = {};
  for (const m of MODE_ORDER) {
    if (buckets[m].length) out[m] = buckets[m];
  }
  return out;
}

export function buildQuery(templates: Template[], blocks: ModeBlock[]): Record<string, unknown> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const inner = makeBoolInnerWithMap(byId, blocks);
  if (Object.keys(inner).length === 0) {
    return { query: { match_all: {} } };
  }
  return { query: { bool: inner } };
}
```

Remove the old `buildQuery` body's inner `resolve` and `makeBoolInner` closures — they're now the module-level `resolveItemWithMap` and `makeBoolInnerWithMap`.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Smoke test**

`npm run dev`. Expand Generated Query, verify the JSON still renders exactly as before (no regression in `buildQuery`). Build a complex tree to sanity-check.

- [ ] **Step 4: Commit**

```powershell
git add src/store.ts
git commit -m "refactor(store): extract resolveItem and buildBlockQuery helpers"
```

### Task 8.2: Eye button on `TemplateCard`

**Files:**
- Modify: `src/components/TemplateCard.tsx`

- [ ] **Step 1: Rewrite the component to include the eye button**

```tsx
import { usePreview } from '../utils/preview';
import type { Template } from '../types';

type Props = {
  template: Template;
  variant?: 'library' | 'overlay' | 'builder';
  dragging?: boolean;
};

export function TemplateCard({ template, variant = 'library', dragging }: Props) {
  const overlay = variant === 'overlay';
  const { open } = usePreview();

  return (
    <div
      className={[
        'group relative rounded-md border px-3 py-2.5 transition-shadow',
        'bg-white dark:bg-neutral-900',
        overlay
          ? 'border-blue-500 shadow-xl ring-2 ring-blue-200 -rotate-1 scale-[1.02] dark:ring-blue-800'
          : 'border-neutral-200 dark:border-neutral-800',
        !overlay && !dragging ? 'hover:border-neutral-400 hover:shadow-sm dark:hover:border-neutral-600' : '',
        dragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div>
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="3" width="16" height="18" rx="2" />
            <path d="M8 8h8" />
            <path d="M8 12h8" />
            <path d="M8 16h5" />
          </svg>
          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {template.name}
          </span>
          {!overlay && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                open(template.name, template.query);
              }}
              className="ml-auto rounded p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title="Preview JSON"
              aria-label="Preview JSON"
            >
              <EyeIcon />
            </button>
          )}
        </div>
        {template.description && (
          <div className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{template.description}</div>
        )}
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 3: Smoke test**

`npm run dev`. Hover a template card → eye button appears top-right. Click it (don't drag!) → modal opens with the template's name as title and its `query` as the JSON body. Escape / backdrop click closes. Verify clicking the eye button does NOT start a drag — pointer-down stop-propagation should suppress dnd-kit.

- [ ] **Step 4: Commit**

```powershell
git add src/components/TemplateCard.tsx
git commit -m "feat(preview): eye button on template cards"
```

### Task 8.3: Eye button on `BuilderRow`

**Files:**
- Modify: `src/components/BuilderRow.tsx`

- [ ] **Step 1: Import preview hook and helpers**

Add to existing imports at the top:
```tsx
import { usePreview } from '../utils/preview';
import { resolveItem } from '../store';
```

- [ ] **Step 2: Add the eye button next to ✎ and ×**

Inside the BuilderRow component body, before the existing `return (...)` for the display branch, add:

```tsx
  const { open: openPreview } = usePreview();
  const previewValue = resolveItem(Array.from(templatesById.values()), item);
  const previewDisabled = previewValue === undefined;
  const previewTitle =
    item.source.kind === 'template'
      ? (templatesById.get(item.source.templateId)?.name ?? 'template')
      : item.source.kind === 'custom'
      ? item.source.name
      : item.source.kind;
```

In the action-buttons block at the bottom of the display branch (the `<div className="flex items-center gap-1 opacity-0 ...">` that holds ✎ and ×), insert **before** the existing edit button:

```tsx
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (!previewDisabled) openPreview(previewTitle, previewValue);
          }}
          disabled={previewDisabled}
          className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:text-neutral-300 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:disabled:text-neutral-700"
          title={previewDisabled ? 'Nothing to preview yet' : 'Preview JSON'}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Smoke test**

`npm run dev`. Hover over a template-source row → eye button appears alongside ✎ and ×. Click it → modal shows the template's resolved query. Try a `term` row with empty fields → eye is disabled with tooltip "Nothing to preview yet". Configure the term → eye becomes enabled, modal shows `{ "term": { ... } }`.

- [ ] **Step 5: Commit**

```powershell
git add src/components/BuilderRow.tsx
git commit -m "feat(preview): eye button on builder rows"
```

### Task 8.4: Eye button in `BlockCard` header

**Files:**
- Modify: `src/components/BlockCard.tsx`

- [ ] **Step 1: Import preview hook and helper**

Add to existing imports:
```tsx
import { usePreview } from '../utils/preview';
import { buildBlockQuery } from '../store';
```

- [ ] **Step 2: Add preview hook usage**

In `BlockCardImpl`, near the other store hook calls:
```tsx
  const templates = useStore((s) => s.templates);
  const { open: openPreview } = usePreview();
```

- [ ] **Step 3: Add the eye button to the header**

In the header JSX, immediately **before** the existing items-count chip (the `<span className="inline-flex items-center gap-1 rounded-full bg-white/20 ...">`), insert:

```tsx
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            openPreview(displayName, buildBlockQuery(templates, block));
          }}
          className="rounded p-1 text-white/70 hover:bg-white/20 hover:text-white"
          title="Preview JSON for this block"
          aria-label="Preview block JSON"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 5: Smoke test**

`npm run dev`. Click the eye in the block header → modal opens showing `{ "bool": { "must": [ ... ] } }` (or whichever mode). Nested blocks: click the eye on a nested block → modal shows just that nested block's `bool`. Confirm the click doesn't trigger a drag.

- [ ] **Step 6: Commit**

```powershell
git add src/components/BlockCard.tsx
git commit -m "feat(preview): eye button on block headers"
```

---

## Phase 9 — Polish (Kibana icon, footer, drag bugfix)

### Task 9.1: Refresh "Open in Kibana" icon

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace the icon SVG**

In `App.tsx` `Header`, find the "Open in Kibana" button's inner `<svg>` (the path with `M14 4h6v6 / M10 14L20 4 / M20 14v6H4V4h6`). Replace the entire svg with a clearer external-link icon:

```tsx
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 3h7v7" />
            <path d="M10 14L21 3" />
            <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
          </svg>
```

- [ ] **Step 2: Verify build + smoke test**

Run: `npm run build`. Then `npm run dev`. Confirm the icon is visible and reads as "external link".

- [ ] **Step 3: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(header): clearer external-link icon on Kibana button"
```

### Task 9.2: Move "by yonka" to footer

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove from header**

In `function Header()`, find:
```tsx
        <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
          by yonka
        </span>
```
Delete the span (and the surrounding wrapper if it becomes empty — actually keep the wrapper since "ElastiX" still lives there). After removal, the wrapper `<div className="flex items-baseline gap-1.5">` should contain only the "ElastiX" span.

Result:
```tsx
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold text-neutral-900 dark:text-neutral-100">ElastiX</span>
      </div>
```

- [ ] **Step 2: Add the footer to the App body**

In `App` (not `Header`), find the closing `</div>` of `<div className="flex h-screen flex-col bg-neutral-50 dark:bg-neutral-950">`. Immediately **before** that closing `</div>`, insert:

```tsx
        <footer className="shrink-0 border-t border-neutral-200 bg-white px-5 py-1 text-center font-mono text-[10px] uppercase tracking-wider text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-500">
          by yonka
        </footer>
```

This sits below the flex-1 row holding palette/builder/library, so the layout becomes: header → (optional banner) → flex-1 row → footer.

- [ ] **Step 3: Verify build + smoke test**

`npm run build`. `npm run dev`. Header no longer says "by yonka"; a thin footer at the bottom says so. Verify the builder area still scrolls correctly (the flex-1 row's `min-h-0` is what allows the inner overflow).

- [ ] **Step 4: Commit**

```powershell
git add src/App.tsx
git commit -m "feat(footer): move by-yonka credit to a bottom footer"
```

### Task 9.3: Allow extracting a nested block to top-level

**Problem:** Dragging a nested `bool` item out and dropping it on the builder canvas does nothing. The "Item drag" branch in `handleDragEnd` has no case for `overData.kind === 'builder-canvas'`. The user has no way to promote a nested block back to top-level except by deleting and rebuilding it.

**Fix:** Add a store action that promotes a nested bool item to a top-level block (preserving its inner items, name, mode), and wire it into the drag handler.

**Files:**
- Modify: `src/store.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add `promoteItemToTopLevel` action to the store**

In `StoreState` type definition, near `moveItemToBlock`:
```ts
  promoteItemToTopLevel: (instanceId: string, atIndex?: number) => void;
```

In the store factory body, near `moveItemToBlock`, add:
```ts
      promoteItemToTopLevel: (instanceId, atIndex) => {
        set((s) => {
          const loc = locateItem(s.blocks, instanceId);
          if (!loc) return s;
          const parent = findBlockById(s.blocks, loc.parentBlockId);
          if (!parent) return s;
          const item = parent.items[loc.index];
          if (!item || item.source.kind !== 'bool') return s;

          // Remove the item from its parent (anywhere in the tree).
          const without = updateBlockById(s.blocks, loc.parentBlockId, (b) => ({
            ...b,
            items: b.items.filter((x) => x.instanceId !== instanceId),
          }));

          // Append (or insert at atIndex) the inner block at top level.
          const inner = item.source.block;
          const blocks = insertAt(without, inner, atIndex);
          return { blocks };
        });
      },
```

- [ ] **Step 2: Wire the drag handler in `App.tsx`**

In `App.tsx`, add the store reference alongside the other action hooks:
```tsx
  const promoteItemToTopLevel = useStore((s) => s.promoteItemToTopLevel);
```

In `handleDragEnd`, the "// 4) Item drag" branch, currently handles `overData.kind === 'item'` and `overData.kind === 'block-zone' | 'block'`. Add a new case **before** the `'item'` case for `'builder-canvas'`:

```tsx
    if (activeData.kind === 'item') {
      // Item dropped on the empty builder canvas — only meaningful for bool
      // items, which become a new top-level block. Leaf items have no
      // meaning at the top level so we ignore them.
      if (overData.kind === 'builder-canvas') {
        const item = getItem(blocks, activeData.instanceId);
        if (item?.source.kind === 'bool') {
          promoteItemToTopLevel(activeData.instanceId);
        }
        return;
      }
      if (overData.kind === 'item') {
        /* unchanged */
      }
      if (overData.kind === 'block-zone' || overData.kind === 'block') {
        /* unchanged */
      }
    }
```

(`getItem` is already imported from `'./store'` at the top of `App.tsx`.)

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: passes.

- [ ] **Step 4: Smoke test**

`npm run dev`. Create a top-level `must` block. Drop a `should` block inside it (nested). Now grab the nested `should` block by its header drag handle and drop it onto the empty builder canvas (outside any block). It should become a new top-level block, preserving its inner items.

Reverse case: drop a top-level block into another block → still works (existing `block` → `block` drag).

- [ ] **Step 5: Commit**

```powershell
git add src/store.ts src/App.tsx
git commit -m "fix(dnd): allow extracting a nested block to top-level"
```

---

## Phase 10 — Production `/api/config` + `/api/count`

### Task 10.1: Extract shared `server/elasticApi.js`

**Files:**
- Create: `server/elasticApi.js`

- [ ] **Step 1: Create the file**

```js
// Shared by vite.config.ts (dev) and server.js (prod).
// Pure ESM JavaScript (no TypeScript syntax) because server.js imports it
// without a build step.

export function makeElasticHandlers(env) {
  const elasticUrl = (env.ELASTIC_URL || env.ELASTICSEARCH_URL || '').replace(/\/$/, '');
  const username = env.ELASTIC_USERNAME || '';
  const password = env.ELASTIC_PASSWORD || '';
  const apiKey = env.ELASTIC_API_KEY || '';
  const indexPattern = env.ELASTIC_INDEX || env.ELASTIC_INDEX_PATTERN || '*';
  const kibanaUrl = (env.KIBANA_URL || '').replace(/\/$/, '');
  const dataViewId = env.KIBANA_DATA_VIEW_ID || '';
  const insecure =
    (env.ELASTIC_INSECURE || '').toLowerCase() === 'true' ||
    (env.NODE_TLS_REJECT_UNAUTHORIZED === '0');

  if (insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const authHeader = apiKey
    ? `ApiKey ${apiKey}`
    : username
    ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
    : '';

  const ready = Boolean(elasticUrl && authHeader);

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(Buffer.from(c)));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function handleConfig(_req, res) {
    json(res, 200, { kibanaUrl, indexPattern, dataViewId, ready });
  }

  async function handleCount(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });
    if (!elasticUrl || !authHeader) {
      return json(res, 503, {
        error:
          'Elastic creds not configured. Set ELASTIC_URL and ELASTIC_USERNAME/ELASTIC_PASSWORD (or ELASTIC_API_KEY).',
      });
    }
    try {
      const raw = await readBody(req);
      const payload = raw ? JSON.parse(raw) : {};
      const idx = encodeURIComponent(payload.index || indexPattern);
      const body = JSON.stringify(payload.query ? { query: payload.query } : {});
      const target = `${elasticUrl}/${idx}/_count`;
      const upstream = await fetch(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: authHeader,
        },
        body,
      });
      const text = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader('content-type', upstream.headers.get('content-type') ?? 'application/json');
      res.end(text);
    } catch (err) {
      json(res, 502, { error: err.message });
    }
  }

  return { handleConfig, handleCount };
}
```

- [ ] **Step 2: Verify it doesn't sneak into the SPA bundle**

Run: `npm run build`. Inspect `dist/assets/*.js` for the strings `handleConfig` or `handleCount`. They should not appear (the file is not imported by any source under `src/`).

Run: `Select-String -Path "dist/assets/*.js" -Pattern "handleConfig"`
Expected: no matches.

- [ ] **Step 3: Commit**

```powershell
git add server/elasticApi.js
git commit -m "feat(server): extract elastic API handlers into shared module"
```

### Task 10.2: Use the shared module from `vite.config.ts`

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Import the shared module and use it in the plugin**

Replace the body of `elasticDevApi` with a thin adapter that calls `makeElasticHandlers`:

```ts
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import { makeElasticHandlers } from './server/elasticApi.js';

function elasticDevApi(env: Record<string, string>): Plugin {
  const { handleConfig, handleCount } = makeElasticHandlers(env);
  return {
    name: 'elastix:dev-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/config', handleConfig);
      server.middlewares.use('/api/count', handleCount);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), elasticDevApi(env)],
    server: { port: 5173, open: true },
  };
});
```

- [ ] **Step 2: Verify dev mode still works**

Run: `npm run dev` (with `.env` configured per `.env.example`). Click "Count docs" — should succeed. Click "Open in Kibana" — should open the URL.

- [ ] **Step 3: Verify build**

Run: `npm run build`.
Expected: passes.

- [ ] **Step 4: Commit**

```powershell
git add vite.config.ts
git commit -m "refactor(vite): use shared elasticApi handlers"
```

### Task 10.3: Mount `/api/config` and `/api/count` in `server.js`

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Import the shared module**

At the top of `server.js`, after the existing imports:
```js
import { makeElasticHandlers } from './server/elasticApi.js';

const { handleConfig, handleCount } = makeElasticHandlers(process.env);
```

- [ ] **Step 2: Wire the routes**

In the request handler (`http.createServer((req, res) => { ... })`), after the method check and before the index/static logic, add:

```js
  if (pathname === '/api/config') {
    return handleConfig(req, res);
  }
  if (pathname === '/api/count') {
    return handleCount(req, res);
  }
```

These must come **before** the line that constructs `safe` from `WEB_ROOT` so they don't fall through to the static handler.

- [ ] **Step 3: Verify it builds and runs locally**

```powershell
npm run build
$env:ELASTIC_URL = "https://example.invalid:9200"
$env:ELASTIC_USERNAME = "elastic"
$env:ELASTIC_PASSWORD = "changeme"
node server.js
```

In a separate terminal:
```powershell
Invoke-RestMethod http://localhost:4000/api/config
```
Expected: JSON with `kibanaUrl`, `indexPattern`, `dataViewId`, `ready: true`.

Then stop the server (Ctrl+C in its terminal).

- [ ] **Step 4: Smoke test the SPA against the prod server**

Open `http://localhost:4000/` in a browser. The "Open in Kibana" and "Count docs" buttons should be **enabled** (because `/api/config` returned `ready: true`). Counting against `example.invalid` will fail with a network error — that's expected. The fix is for the buttons to be wired, not for that specific URL to work.

Stop the server.

- [ ] **Step 5: Commit**

```powershell
git add server.js
git commit -m "feat(server): mount /api/config and /api/count in prod server"
```

---

## Phase 11 — Final verification

### Task 11.1: End-to-end smoke

**Files:** none (verification only)

- [ ] **Step 1: Clean install**

```powershell
Remove-Item -Recurse -Force node_modules
Remove-Item -Force package-lock.json
npm install
npm run build
```
Expected: install completes; build passes.

- [ ] **Step 2: Dev mode full sweep**

`npm run dev`. With a configured `.env`:
- Toggle dark mode → header sun/moon, body bg, all components readable in both themes
- Drag every leaf clause from palette (custom, timestamp, term, match, **wildcard**, terms, exists) — all open their forms, save correctly, appear in Generated Query
- Generated Query expands; collapse toggles work on nested objects/arrays
- Click eye on a template card → modal shows query
- Click eye on a template row in builder → modal shows resolved query
- Click eye on a leaf row → modal shows leaf query (with disabled state when empty)
- Click eye on a block header (top-level and nested) → modal shows bool subtree
- Search templates → filters live, `×` clears, no-match state shows
- Rename a block, add nested blocks, set up a non-trivial tree
- Click Export → file downloads
- Reload, blocks are still there (zustand persist)
- Click "Clear" or manually delete blocks, then Import the file → confirm prompt → blocks restored identically including names
- Import an arbitrary JSON file → error banner
- Click "Count docs" → request to Elastic succeeds (or surfaces a real upstream error, not the disabled state)
- Click "Open in Kibana" → opens in a new tab
- Footer shows "by yonka", no longer in header

- [ ] **Step 3: Prod mode sweep**

```powershell
npm run build
$env:ELASTIC_URL = "..."  # real cluster
$env:ELASTIC_USERNAME = "..."
$env:ELASTIC_PASSWORD = "..."
$env:KIBANA_URL = "..."
node server.js
```
Open `http://localhost:4000/`. Verify: `/api/config` returns `ready: true`; "Count docs" works; templates load (from the bundled `web/templates.json` fallback or a mounted ConfigMap).

- [ ] **Step 4: Final commit (if any fixups)**

```powershell
git add -A
git commit -m "chore: post-implementation cleanups" # only if anything changed
```

---

## File-level impact summary

**New files:**
- `src/components/JsonTree.tsx`
- `src/components/JsonPreviewModal.tsx`
- `src/components/WildcardForm.tsx`
- `src/utils/theme.ts`
- `src/utils/preview.tsx`
- `server/elasticApi.js`

**Modified files:**
- `package.json`, `package-lock.json` (remove `@monaco-editor/react`)
- `tailwind.config.js`
- `index.html`
- `src/index.css`
- `src/types.ts`
- `src/store.ts`
- `src/App.tsx`
- `src/components/QueryOutput.tsx`
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
- `server.js`
- `vite.config.ts`

## Risks / things to watch

- `@dnd-kit` listeners on cards: eye buttons must `stopPropagation` on `pointerdown` so they don't initiate a drag. Verified in the design but easy to forget on a new surface.
- `MODE_META` strings are now Tailwind class-list strings with `dark:` variants. Tailwind's JIT only includes classes that appear literally in source — verify by searching the built CSS bundle for `dark:bg-emerald-950` after `npm run build` if dark colors look wrong.
- `server.js` previously had no route handling beyond static — make sure the `/api/*` checks short-circuit **before** the path-normalization safety check.
- The theme bootstrap script must remain in `<head>`, BEFORE any element that paints — otherwise there will be a brief light-mode flash on dark users.
