import { useEffect, useMemo, useState } from 'react';
import { useStore, buildQuery } from '../store';
import { JsonTree } from './JsonTree';
import { JsonPreviewModal } from './JsonPreviewModal';

// Last-used user name survives across sessions — prefilled on the next open,
// saved (only) when a cobrun is actually sent.
const USER_KEY = 'elastix-cobrun-user';
// Sent runs, newest first, capped — shown as "Recent runs" on the form step.
const HISTORY_KEY = 'elastix-cobrun-history';
const HISTORY_MAX = 50;

const DEFAULT_RATE = 200;
const DEFAULT_PRIORITY = 1;

// Catalog actions with their own dropdown color: delete is rose (danger),
// these are blue. Compared lowercase.
const BLUE_ACTIONS = new Set(['mq-send', 'artifact']);

type HistoryEntry = {
  at: string; // ISO timestamp of the send
  action: string;
  title: string;
  user: string;
  rate: number;
  // Optional like query — entries saved before priority existed lack it.
  priority?: number;
  // The query that was sent — viewable from the history list. Optional so
  // entries saved before this field existed still render (without the button).
  query?: Record<string, unknown>;
};

function readStoredUser(): string {
  try {
    return localStorage.getItem(USER_KEY) ?? '';
  } catch {
    return '';
  }
}

function readHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function writeHistory(list: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* ignore */
  }
}

// "10.06" — compact zero-padded date for the history list; the full
// timestamp lives in the row's hover tooltip.
function shortDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

// "10.06.2026 23:03:49" — zero-padded full timestamp for the hover tooltip.
function fullDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// "10_06_rerun" — dd_MM_action, the auto-title used when Title is left blank
// (also previewed live in the placeholder). Spaces in the action become
// underscores so the whole title stays one token.
function defaultTitle(action: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}_${pad(d.getMonth() + 1)}_${action.trim().replace(/\s+/g, '_')}`;
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'ok' }
  | { kind: 'err'; message: string };

type CountState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; count: number }
  | { kind: 'err'; message: string };

// Catalog fetched from /api/cobrun-actions or /api/cobrun-priorities
// (→ COBRUN_ACTION_LIST_URL / COBRUN_PRIORITY_LIST_URL). 'none' = the URL
// isn't configured server-side — the field stays a free input instead of a
// dropdown.
type CatalogState<T> =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ok'; items: T[] }
  | { kind: 'err'; message: string };

// Same normalisation as CountDocs — ES nests { error: { type, reason } },
// our middleware returns { error: "message" }.
function errorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const e = error as { reason?: string; type?: string };
    if (e.reason) return e.type ? `${e.type}: ${e.reason}` : e.reason;
    return JSON.stringify(error);
  }
  return String(error);
}

// Header button + modal. Three steps by design:
//   1. form — action / title / priority / rate / user (+ recent-runs history).
//   2. review — shows the EXACT JSON that will be POSTed to /api/cobrun
//      (→ COBRUN_URL server-side) plus the live doc count of the query;
//      nothing is sent before this screen.
//   3. confirm (delete actions only) — asks again, repeats the impacted doc
//      count, and requires typing "delete" before Send unlocks.
// When COBRUN_PASSWORD is set server-side, sending also requires the password
// (verified by the proxy — the password itself never reaches the browser).
export function CreateCobrun() {
  const templates = useStore((s) => s.templates);
  const blocks = useStore((s) => s.blocks);
  const config = useStore((s) => s.config);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'form' | 'review' | 'confirmDelete'>('form');
  const [action, setAction] = useState('');
  const [title, setTitle] = useState('');
  // Title actually sent: typed title, or "{current time} {action}" when left
  // blank — resolved when leaving the form so preview and send match.
  const [resolvedTitle, setResolvedTitle] = useState('');
  const [priority, setPriority] = useState(String(DEFAULT_PRIORITY));
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [actionsState, setActionsState] = useState<CatalogState<string>>({ kind: 'none' });
  const [prioritiesState, setPrioritiesState] = useState<CatalogState<number>>({ kind: 'none' });
  // Custom combobox dropdown for the Action field (catalog mode only):
  // whether the suggestion list is open and which row the keyboard highlights.
  const [actionListOpen, setActionListOpen] = useState(false);
  const [actionHighlight, setActionHighlight] = useState(0);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  // Destructive-action guard: the confirm step requires typing "delete".
  const [confirmText, setConfirmText] = useState('');
  const [sendState, setSendState] = useState<SendState>({ kind: 'idle' });
  const [countState, setCountState] = useState<CountState>({ kind: 'idle' });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  // History entry whose query is open in the JSON popup.
  const [historyPreview, setHistoryPreview] = useState<HistoryEntry | null>(null);

  const built = useMemo(() => buildQuery(templates, blocks), [templates, blocks]);
  // buildQuery returns the full { query: ... } document; the cobrun body has
  // its own "query" key, so embed the inner query (same unwrap as /api/count).
  const innerQuery = (built as { query?: Record<string, unknown> }).query ?? { match_all: {} };

  const rateNum = Number(rate);
  const rateValid = rate.trim() !== '' && Number.isFinite(rateNum) && rateNum > 0;
  const priorityNum = Number(priority);
  const priorityValid = priority.trim() !== '' && Number.isFinite(priorityNum);
  // With a loaded action catalog the field is free to type into, but the
  // typed value must match a catalog entry (case-insensitive) — the catalog's
  // canonical spelling is what gets sent.
  const catalogAction =
    actionsState.kind === 'ok'
      ? actionsState.items.find((a) => a.toLowerCase() === action.trim().toLowerCase()) ?? null
      : null;
  const actionValue = catalogAction ?? action.trim();
  const actionValid =
    actionsState.kind === 'none' ? action.trim().length > 0 : catalogAction !== null;
  // Suggestions = catalog entries containing the typed text (all when blank).
  const actionSuggestions =
    actionsState.kind === 'ok'
      ? actionsState.items.filter((a) => a.toLowerCase().includes(action.trim().toLowerCase()))
      : [];
  // The highlight can point past the end after the filter shrinks — clamp it.
  const actionHighlightClamped = actionSuggestions.length
    ? Math.min(actionHighlight, actionSuggestions.length - 1)
    : 0;

  const pickAction = (a: string) => {
    setAction(a);
    setActionListOpen(false);
  };
  // Title is optional — blank auto-titles with time + action.
  const canReview = actionValid && user.trim().length > 0 && rateValid && priorityValid;

  const isDelete = action.trim().toLowerCase() === 'delete';
  const deleteConfirmed = confirmText.trim().toLowerCase() === 'delete';
  // Deletes have their own password when COBRUN_DELETE_PASSWORD is set
  // (falling back to the regular gate otherwise); the server checks the
  // matching one based on the body's action.
  const passwordRequired = isDelete
    ? config.cobrunDeleteAuth || config.cobrunAuth
    : config.cobrunAuth;
  const usesDeletePassword = isDelete && config.cobrunDeleteAuth;
  const passwordOk = !passwordRequired || password.trim().length > 0;

  // "total" is part of the service contract — always 0 on creation.
  const body = {
    actions: [actionValue],
    title: resolvedTitle,
    priority: priorityNum,
    query: innerQuery,
    options: { entitiesPerSecond: rateNum },
    user: user.trim(),
    total: 0,
  };

  // The catalogs of allowed actions / priorities, proxied from
  // COBRUN_ACTION_LIST_URL / COBRUN_PRIORITY_LIST_URL. Re-fetched on every
  // modal open so a changed catalog needs no reload.
  async function fetchCatalog<T>(
    path: string,
    key: 'actions' | 'priorities',
    keep: (v: unknown) => v is T,
    set: (s: CatalogState<T>) => void
  ) {
    set({ kind: 'loading' });
    try {
      const res = await fetch(path);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const list = data[key];
      if (res.ok && Array.isArray(list)) {
        set({ kind: 'ok', items: list.filter(keep) });
      } else {
        set({ kind: 'err', message: errorMessage(data.error) || `HTTP ${res.status}` });
      }
    } catch (err) {
      set({ kind: 'err', message: (err as Error).message });
    }
  }

  const fetchActions = () =>
    fetchCatalog('/api/cobrun-actions', 'actions', (v): v is string => typeof v === 'string', setActionsState);
  const fetchPriorities = () =>
    fetchCatalog(
      '/api/cobrun-priorities',
      'priorities',
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
      setPrioritiesState
    );

  const openModal = () => {
    setAction('');
    setTitle('');
    setResolvedTitle('');
    setRate(String(DEFAULT_RATE));
    setUser(readStoredUser());
    setPassword('');
    setConfirmText('');
    setStep('form');
    setSendState({ kind: 'idle' });
    setCountState({ kind: 'idle' });
    setHistory(readHistory());
    if (config.cobrunActions) void fetchActions();
    else setActionsState({ kind: 'none' });
    setActionListOpen(false);
    setActionHighlight(0);
    // With a priority catalog the field starts unselected (like Action);
    // free-input mode keeps the prefilled default.
    setPriority(config.cobrunPriorities ? '' : String(DEFAULT_PRIORITY));
    if (config.cobrunPriorities) void fetchPriorities();
    else setPrioritiesState({ kind: 'none' });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // When the query popup is open, Escape closes it (its own handler) —
      // not the whole modal.
      if (e.key === 'Escape' && sendState.kind !== 'sending' && !historyPreview) setOpen(false);
      // Enter = the step's primary action. The form step already submits
      // natively (inputs live in a <form>); review/confirm have no form, so
      // drive them here. Skip when a button has focus — Enter already
      // "clicks" it natively and handling it here too would double-fire.
      if (
        e.key === 'Enter' &&
        !historyPreview &&
        step !== 'form' &&
        (e.target as HTMLElement | null)?.tagName !== 'BUTTON'
      ) {
        e.preventDefault();
        if (sendState.kind === 'ok') {
          setOpen(false);
        } else if (sendState.kind !== 'sending') {
          if (step === 'review' && (isDelete || passwordOk)) proceedFromReview();
          else if (step === 'confirmDelete' && deleteConfirmed && passwordOk) void send();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // proceedFromReview/send are re-created per render; the dep list below
    // covers every piece of state they read (password itself, not just the
    // derived passwordOk, so each keystroke refreshes the closure), so the
    // closure is never stale.
  }, [open, sendState.kind, historyPreview, step, isDelete, password, deleteConfirmed]);

  const close = () => {
    if (sendState.kind === 'sending') return;
    setOpen(false);
  };

  // Keep the keyboard-highlighted suggestion visible while arrowing through
  // a list taller than the dropdown.
  useEffect(() => {
    if (!actionListOpen) return;
    document
      .getElementById(`cobrun-action-opt-${actionHighlightClamped}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [actionListOpen, actionHighlightClamped]);

  // Live doc count for the query — shown on every pre-send screen so the
  // scope of the run is visible before anything is sent.
  const fetchCount = async () => {
    setCountState({ kind: 'loading' });
    try {
      const res = await fetch('/api/count', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: innerQuery }),
      });
      const data = (await res.json().catch(() => ({}))) as { count?: number; error?: unknown };
      if (res.ok && typeof data.count === 'number') {
        setCountState({ kind: 'ok', count: data.count });
      } else {
        setCountState({ kind: 'err', message: errorMessage(data.error) || `HTTP ${res.status}` });
      }
    } catch (err) {
      setCountState({ kind: 'err', message: (err as Error).message });
    }
  };

  const goReview = () => {
    if (!canReview) return;
    setResolvedTitle(title.trim() || defaultTitle(actionValue));
    setStep('review');
    void fetchCount();
  };

  // Review's primary button: delete actions get the extra confirm screen
  // (ask again + impacted-docs count); everything else sends right away.
  const proceedFromReview = () => {
    if (isDelete) {
      setConfirmText('');
      setStep('confirmDelete');
    } else {
      void send();
    }
  };

  const send = async () => {
    setSendState({ kind: 'sending' });
    try {
      localStorage.setItem(USER_KEY, user.trim());
    } catch {
      /* ignore */
    }
    try {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (passwordRequired) headers['x-cobrun-password'] = password.trim();
      const res = await fetch('/api/cobrun', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) {
        const msg =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : text.slice(0, 200) || `HTTP ${res.status}`;
        setSendState({ kind: 'err', message: msg });
        return;
      }
      const entry: HistoryEntry = {
        at: new Date().toISOString(),
        action: body.actions[0],
        title: body.title,
        user: body.user,
        rate: rateNum,
        priority: body.priority,
        query: body.query,
      };
      const next = [entry, ...readHistory()].slice(0, HISTORY_MAX);
      writeHistory(next);
      setHistory(next);
      setSendState({ kind: 'ok' });
    } catch (err) {
      setSendState({ kind: 'err', message: (err as Error).message });
    }
  };

  const inputClass =
    'mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-neutral-500';
  const labelClass =
    'block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400';

  const passwordField = passwordRequired && sendState.kind !== 'ok' && (
    <div className="shrink-0 border-t border-neutral-200 px-4 py-2 dark:border-neutral-700">
      <label className={usesDeletePassword ? `${labelClass} !text-rose-600 dark:!text-rose-400` : labelClass}>
        {usesDeletePassword ? 'Delete password' : 'Password'}
      </label>
      <input
        className={inputClass}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={usesDeletePassword ? 'deletes require their own password' : 'required to send'}
        autoComplete="off"
      />
    </div>
  );

  // Inline warning + retry under a catalog dropdown whose fetch failed.
  const catalogError = (state: CatalogState<unknown>, retry: () => void) =>
    state.kind === 'err' && (
      <span className="mt-1 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-400">
        ⚠ {state.message}
        <button
          type="button"
          onClick={retry}
          className="rounded px-1 py-0.5 font-medium underline hover:bg-amber-50 dark:hover:bg-amber-950"
        >
          retry
        </button>
      </span>
    );

  const errBanner = sendState.kind === 'err' && (
    <div className="shrink-0 border-t border-rose-300 bg-rose-50 px-4 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
      <span className="font-semibold">Send failed:</span> {sendState.message}
    </div>
  );

  // Springs in on mount while the checkmark draws itself — see .cobrun-sent
  // and .cobrun-check in index.css.
  const okBanner = sendState.kind === 'ok' && (
    <div className="cobrun-sent flex shrink-0 items-center justify-center gap-1.5 border-t border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path className="cobrun-check" d="M5 12l5 5L20 7" />
      </svg>
      Cobrun Request Sent
    </div>
  );

  const spinner = (
    <svg viewBox="0 0 24 24" className="h-3 w-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );

  // Doc-count stat card for the pre-send screens: icon circle + mono number +
  // caption, the same chip language the rest of the app uses. Rose accents
  // when the action is a delete, blue otherwise.
  const countPanel = (
    <div className="flex shrink-0 items-center justify-center gap-3 border-b border-neutral-200 bg-neutral-50/60 px-4 py-2.5 dark:border-neutral-700 dark:bg-neutral-800/60">
      {countState.kind === 'loading' && (
        <span className="inline-flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {spinner} Counting matching docs…
        </span>
      )}
      {countState.kind === 'ok' && (
        // Keyed by the count so a fresh number remounts and replays the
        // one-shot pop (same trick as the header count chip).
        <span
          key={countState.count}
          className="count-pop whitespace-nowrap font-mono text-2xl font-extrabold tabular-nums"
        >
          <span className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent dark:from-sky-400 dark:via-blue-400 dark:to-indigo-400">
            {countState.count.toLocaleString()}
          </span>{' '}
          <span className="text-base font-bold text-neutral-400 dark:text-neutral-500">Docs</span>
        </span>
      )}
      {countState.kind === 'err' && (
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400" title={countState.message}>
          ⚠ Doc count unavailable: {countState.message}
        </span>
      )}
    </div>
  );

  return (
    <>
      <button
        onClick={openModal}
        disabled={!config.cobrun}
        className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-semibold text-violet-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-400 disabled:hover:bg-white dark:border-violet-800 dark:bg-neutral-900 dark:text-violet-300 dark:hover:border-violet-700 dark:hover:bg-violet-950 dark:disabled:border-neutral-700 dark:disabled:text-neutral-500 dark:disabled:hover:bg-neutral-900"
        title={
          config.cobrun
            ? 'Create a cobrun from the generated query'
            : 'Set COBRUN_URL in .env to enable'
        }
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <path d="M10 8.5l5 3.5-5 3.5z" />
        </svg>
        <span className="hidden sm:inline">Create Cobrun</span>
      </button>

      {open && (
        <div
          className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-pop flex max-h-[80vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
          >
            <header className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
              <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Create Cobrun
              </span>
              {/* Step progress bar — one track that fills proportionally:
                  step 1 of 2 → half, step 2 → full (deletes have 3 steps). */}
              <span className="ml-3 flex items-center gap-2">
                <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-violet-500 transition-all duration-300"
                    style={{
                      width: `${(((step === 'form' ? 0 : step === 'review' ? 1 : 2) + 1) / (isDelete ? 3 : 2)) * 100}%`,
                    }}
                  />
                  {/* Stage dividers — [——|——] ticks at each step boundary,
                      painted over the fill in the modal's background color. */}
                  {Array.from({ length: (isDelete ? 3 : 2) - 1 }, (_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className="absolute inset-y-0 w-0.5 bg-white dark:bg-neutral-900"
                      style={{ left: `${((i + 1) / (isDelete ? 3 : 2)) * 100}%` }}
                    />
                  ))}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
                  {step === 'form' ? 'details' : step === 'review' ? 'review body' : 'confirm delete'}
                </span>
              </span>
              <button
                onClick={close}
                disabled={sendState.kind === 'sending'}
                className="ml-auto rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 disabled:cursor-not-allowed dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                aria-label="Close"
              >
                ×
              </button>
            </header>

            {step === 'form' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  goReview();
                }}
                className="flex min-h-0 flex-col"
              >
                {/* Fields + history scroll; the footer below stays pinned so
                    Cancel / Review are always reachable even with a full
                    50-entry history. */}
                <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                <label className={labelClass}>Action</label>
                {/* COBRUN_ACTION_LIST_URL configured → typeable combobox with
                    a custom suggestion dropdown (browser datalist looks too
                    native); typing filters, ↑/↓ + Enter or click picks, and
                    only a value matching the catalog unlocks Review. Not
                    configured → plain free text. */}
                <div className="relative">
                  <input
                    className={`${inputClass} ${actionsState.kind === 'ok' ? 'pr-8' : ''}`}
                    value={action}
                    onChange={(e) => {
                      setAction(e.target.value);
                      setActionListOpen(true);
                      setActionHighlight(0);
                    }}
                    onFocus={() => actionsState.kind === 'ok' && setActionListOpen(true)}
                    onClick={() => actionsState.kind === 'ok' && setActionListOpen(true)}
                    onBlur={() => setActionListOpen(false)}
                    onKeyDown={(e) => {
                      if (actionsState.kind !== 'ok') return;
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (!actionListOpen) setActionListOpen(true);
                        else if (actionSuggestions.length)
                          setActionHighlight((actionHighlightClamped + 1) % actionSuggestions.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        if (actionSuggestions.length)
                          setActionHighlight(
                            (actionHighlightClamped - 1 + actionSuggestions.length) % actionSuggestions.length
                          );
                      } else if (e.key === 'Enter') {
                        // Pick instead of submitting the form while the list
                        // is open; the next Enter (list closed) submits.
                        if (actionListOpen && actionSuggestions.length) {
                          e.preventDefault();
                          pickAction(actionSuggestions[actionHighlightClamped]);
                        }
                      } else if (e.key === 'Escape' && actionListOpen) {
                        // Close just the list — stop it reaching the modal's
                        // window-level Escape (which closes the whole modal).
                        e.preventDefault();
                        e.stopPropagation();
                        setActionListOpen(false);
                      }
                    }}
                    disabled={actionsState.kind === 'loading'}
                    placeholder={
                      actionsState.kind === 'loading'
                        ? 'Loading actions…'
                        : actionsState.kind === 'ok'
                        ? 'type or pick an action'
                        : 'e.g. rerun'
                    }
                    role={actionsState.kind === 'ok' ? 'combobox' : undefined}
                    aria-expanded={actionsState.kind === 'ok' ? actionListOpen : undefined}
                    spellCheck={false}
                    autoComplete="off"
                    autoFocus
                  />
                  {actionsState.kind === 'ok' && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={actionListOpen ? 'Hide actions' : 'Show actions'}
                      // mousedown (not click) + preventDefault so the input
                      // keeps focus and its blur doesn't close-then-reopen.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setActionListOpen((v) => !v);
                      }}
                      className="absolute inset-y-0 right-0 mt-1 flex w-8 items-center justify-center text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`h-3.5 w-3.5 transition-transform ${actionListOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                  )}
                  {actionListOpen && actionsState.kind === 'ok' && (
                    <div className="drop-in absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-600 dark:bg-neutral-800">
                      {actionSuggestions.length > 0 ? (
                        <ul role="listbox" className="max-h-44 overflow-auto py-1">
                          {actionSuggestions.map((a, i) => (
                            <li key={a}>
                              <button
                                type="button"
                                id={`cobrun-action-opt-${i}`}
                                role="option"
                                aria-selected={i === actionHighlightClamped}
                                // mousedown + preventDefault: the input's
                                // blur would otherwise close the list before
                                // click.
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  pickAction(a);
                                }}
                                onMouseEnter={() => setActionHighlight(i)}
                                className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
                                  i === actionHighlightClamped
                                    ? 'bg-violet-50 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                                    : a.toLowerCase() === 'delete'
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : BLUE_ACTIONS.has(a.toLowerCase())
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-neutral-700 dark:text-neutral-200'
                                }`}
                              >
                                {a}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
                          No matching actions
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {actionsState.kind === 'ok' && action.trim() !== '' && !catalogAction && (
                  <span className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                    Must match one of the listed actions.
                  </span>
                )}
                {catalogError(actionsState, () => void fetchActions())}
                {isDelete && (
                  <span className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    Delete action — an extra confirmation with the impacted doc count follows.
                  </span>
                )}

                <label className={`mt-3 ${labelClass}`}>Title (optional)</label>
                <input
                  className={inputClass}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle(actionValue || '<action>')}
                  spellCheck={false}
                />
                <span className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                  Left blank → auto-titled dd_MM_action.
                </span>

                <label className={`mt-3 ${labelClass}`}>Priority</label>
                {/* COBRUN_PRIORITY_LIST_URL configured → dropdown limited to
                    the catalog (values arrive as numbers from the proxy).
                    Not configured → free numeric input. */}
                {prioritiesState.kind === 'none' ? (
                  <input
                    className={`${inputClass} font-mono`}
                    type="number"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    placeholder={String(DEFAULT_PRIORITY)}
                  />
                ) : (
                  <select
                    className={`${inputClass} font-mono`}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    disabled={prioritiesState.kind !== 'ok'}
                  >
                    <option value="" disabled>
                      {prioritiesState.kind === 'loading'
                        ? 'Loading priorities…'
                        : prioritiesState.kind === 'err'
                        ? 'Could not load priorities'
                        : 'Select a priority…'}
                    </option>
                    {prioritiesState.kind === 'ok' &&
                      prioritiesState.items.map((p) => (
                        <option key={p} value={String(p)}>
                          {p}
                        </option>
                      ))}
                  </select>
                )}
                {catalogError(prioritiesState, () => void fetchPriorities())}

                <label className={`mt-3 ${labelClass}`}>Rate (entities per second)</label>
                <input
                  className={`${inputClass} font-mono`}
                  type="number"
                  min={1}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder={String(DEFAULT_RATE)}
                />

                <label className={`mt-3 ${labelClass}`}>User name</label>
                <input
                  className={inputClass}
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="who is running this"
                  spellCheck={false}
                />
                <span className="mt-1 text-[11px] text-neutral-400 dark:text-neutral-500">
                  Remembered from your last cobrun.
                </span>

                {history.length > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
                        Recent runs
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Same confirm pattern as the builder's destructive
                          // actions — clearing is irreversible.
                          if (!window.confirm('Clear the recent runs history? This cannot be undone.')) return;
                          writeHistory([]);
                          setHistory([]);
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                      >
                        clear
                      </button>
                    </div>
                    <ul className="mt-1 max-h-36 divide-y divide-neutral-100 overflow-auto rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-700">
                      {history.map((h, i) => (
                        <li key={`${h.at}-${i}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                          <span
                            className="shrink-0 cursor-default font-mono text-neutral-400 dark:text-neutral-500"
                            title={fullDate(h.at)}
                          >
                            {shortDate(h.at)}
                          </span>
                          <span aria-hidden className="shrink-0 text-neutral-200 dark:text-neutral-700">
                            |
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-px font-mono text-[10px] ${
                              h.action.toLowerCase() === 'delete'
                                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300'
                            }`}
                          >
                            {h.action}
                          </span>
                          <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-200" title={h.title}>
                            {h.title}
                          </span>
                          {h.priority !== undefined && (
                            <span
                              className="ml-auto shrink-0 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-px font-mono text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              title={`Priority ${h.priority}`}
                            >
                              P{h.priority}
                            </span>
                          )}
                          <span
                            className={`shrink-0 font-mono text-neutral-400 dark:text-neutral-500 ${
                              h.priority === undefined ? 'ml-auto' : ''
                            }`}
                          >
                            {h.rate}/s
                          </span>
                          <button
                            type="button"
                            onClick={() => setHistoryPreview(h)}
                            title={
                              h.query
                                ? 'Show the query this run was sent with'
                                : 'Query not recorded (run sent before query history existed)'
                            }
                            aria-label="Show sent query"
                            className={`shrink-0 rounded p-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 ${
                              h.query
                                ? 'text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200'
                                : 'text-neutral-300 dark:text-neutral-600'
                            }`}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!canReview}
                    title={canReview ? 'See the exact body before sending' : 'Fill in action, priority, a positive rate and user name'}
                    className="rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                  >
                    Review body →
                  </button>
                </div>
              </form>
            )}

            {step === 'review' && (
              <div className="flex min-h-0 flex-col">
                <div className="shrink-0 border-b border-neutral-200 bg-violet-50/60 px-4 py-2 font-mono text-[11px] text-violet-800 dark:border-neutral-700 dark:bg-violet-950/40 dark:text-violet-300">
                  POST /api/cobrun → COBRUN_URL — this exact body:
                </div>
                {countPanel}
                <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                  {/* query folded by default — it's already visible in the
                      Generated Query panel; expand to double-check inline. */}
                  <JsonTree value={body} defaultCollapsedKeys={['query']} />
                </div>

                {!isDelete && passwordField}
                {errBanner}
                {okBanner}

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
                  {sendState.kind === 'ok' ? (
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      Close
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setStep('form')}
                        disabled={sendState.kind === 'sending'}
                        className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:disabled:text-neutral-500"
                      >
                        ← Back
                      </button>
                      <button
                        onClick={proceedFromReview}
                        disabled={sendState.kind === 'sending' || (!isDelete && !passwordOk)}
                        title={
                          !isDelete && !passwordOk
                            ? 'Enter the cobrun password to send'
                            : isDelete
                            ? 'Delete actions need one more confirmation'
                            : 'Send this body to the cobrun service'
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                      >
                        {sendState.kind === 'sending' && spinner}
                        {sendState.kind === 'sending'
                          ? 'Sending…'
                          : isDelete
                          ? 'Continue →'
                          : 'Send cobrun'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 'confirmDelete' && (
              <div className="flex min-h-0 flex-col">
                <div className="shrink-0 border-b border-rose-300 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
                  ⚠ This cobrun runs a delete — are you sure?
                </div>
                {countPanel}
                <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-neutral-700 dark:text-neutral-200">
                  {sendState.kind !== 'ok' && (
                    <>
                      <label className={labelClass}>Type "delete" to confirm</label>
                      <input
                        className={inputClass}
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="delete"
                        spellCheck={false}
                        autoFocus
                      />
                    </>
                  )}
                </div>

                {passwordField}
                {errBanner}
                {okBanner}

                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
                  {sendState.kind === 'ok' ? (
                    <button
                      onClick={() => setOpen(false)}
                      className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
                    >
                      Close
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setStep('review')}
                        disabled={sendState.kind === 'sending'}
                        className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:disabled:text-neutral-500"
                      >
                        ← Back
                      </button>
                      <button
                        onClick={() => void send()}
                        disabled={sendState.kind === 'sending' || !deleteConfirmed || !passwordOk}
                        title={
                          !deleteConfirmed
                            ? 'Type "delete" to unlock'
                            : !passwordOk
                            ? 'Enter the cobrun password to send'
                            : 'Send the delete cobrun'
                        }
                        className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-neutral-300 dark:disabled:bg-neutral-700 dark:disabled:text-neutral-500"
                      >
                        {sendState.kind === 'sending' && spinner}
                        {sendState.kind === 'sending' ? 'Sending…' : 'Yes, send delete'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sibling of the cobrun modal (not nested) so its backdrop click
          doesn't bubble into the modal's close handler. */}
      <JsonPreviewModal
        open={historyPreview !== null}
        title={historyPreview ? `Sent query — ${historyPreview.title}` : ''}
        value={
          historyPreview?.query ??
          'Query was not recorded for this run (sent before query history was added).'
        }
        onClose={() => setHistoryPreview(null)}
      />
    </>
  );
}
