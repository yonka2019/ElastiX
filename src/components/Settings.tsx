import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useTheme, LIGHT_TINTS, DARK_TINTS } from '../utils/theme';

// Header settings flyout: auto doc-count preference + theme mode/tints.
export function Settings() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const config = useStore((s) => s.config);
  const autoCount = useStore((s) => s.autoCount);
  const setAutoCount = useStore((s) => s.setAutoCount);
  const { theme, setTheme, lightTint, darkTint, setLightTint, setDarkTint } = useTheme();

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
        className={[
          'inline-flex items-center justify-center rounded-md border p-1.5 transition-colors',
          open
            ? 'border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200'
            : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800',
        ].join(' ')}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open && (
        <div className="modal-pop absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-neutral-200 bg-white p-3 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
          {/* ── Docs count ── */}
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
            Docs count
          </div>
          <button
            onClick={() => setAutoCount(!autoCount)}
            disabled={!config.ready}
            role="switch"
            aria-checked={autoCount}
            className="flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:text-neutral-400 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:disabled:text-neutral-500"
            title={
              config.ready
                ? 'Recount matching docs automatically whenever the query changes'
                : 'Set ELASTIC_URL + creds in .env to enable'
            }
          >
            <span>
              Auto count
              <span className="block text-[11px] text-neutral-400 dark:text-neutral-500">
                Recount when the query changes
              </span>
            </span>
            <span
              aria-hidden
              className={[
                'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200',
                autoCount ? 'bg-emerald-500 dark:bg-emerald-600' : 'bg-neutral-300 dark:bg-neutral-600',
                config.ready ? '' : 'opacity-50',
              ].join(' ')}
            >
              <span
                className={[
                  'absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200',
                  autoCount ? 'translate-x-3' : '',
                ].join(' ')}
              />
            </span>
          </button>

          <div className="my-3 h-px bg-neutral-200 dark:bg-neutral-800" />

          {/* ── Theme ── */}
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500">
            Theme
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {(['light', 'dark'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTheme(m)}
                aria-pressed={theme === m}
                className={[
                  'inline-flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors',
                  theme === m
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800',
                ].join(' ')}
              >
                {m === 'light' ? (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
                {m}
              </button>
            ))}
          </div>

          {/* Only the ACTIVE mode's tints are offered — each mode remembers
              its own pick, shown again when you switch back. */}
          <div className="mb-1.5">
            <div className="mb-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {theme === 'light' ? 'Light themes' : 'Dark themes'}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(theme === 'light' ? LIGHT_TINTS : DARK_TINTS).map((t) => {
                const active = theme === 'light' ? lightTint === t.id : darkTint === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      // Narrowed by mode: LIGHT_TINTS ids go to setLightTint,
                      // DARK_TINTS ids to setDarkTint.
                      if (theme === 'light') setLightTint(t.id as (typeof LIGHT_TINTS)[number]['id']);
                      else setDarkTint(t.id as (typeof DARK_TINTS)[number]['id']);
                    }}
                    aria-pressed={active}
                    title={t.label}
                    className={[
                      'flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] transition-colors',
                      active
                        ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950 dark:text-blue-300'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800',
                    ].join(' ')}
                  >
                    <span
                      className="h-5 w-5 rounded-full border border-neutral-300 shadow-sm dark:border-neutral-600"
                      style={{ backgroundColor: t.swatch }}
                      aria-hidden
                    />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
