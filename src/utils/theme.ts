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

function applyClass(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

// Origin point for the circular reveal. Defaults to viewport center so
// keyboard-driven toggles still feel symmetric.
type ToggleOrigin = { x: number; y: number };

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Smooth crossfade of every coloured element between themes. We add a
// short-lived `theme-transition` class to <html>, force a style recalc so
// the transition is committed BEFORE the class swap (otherwise the browser
// batches both and the change snaps), flip `.dark`, then drop the class
// so hover / focus / drag transitions go back to their normal cadence.
// No overlay, no covered UI, no "empty screen" beat — every element
// interpolates simultaneously.
const TRANSITION_MS = 220;

function applyAnimated(theme: Theme, _origin: ToggleOrigin | null) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  // Force a style recalc so the transition class is registered as the
  // current style baseline BEFORE the .dark swap. Reading offsetWidth is
  // the canonical way to flush pending style/layout in the same tick.
  void root.offsetWidth;
  applyClass(theme);
  window.setTimeout(() => {
    root.classList.remove('theme-transition');
  }, TRANSITION_MS);
}

export function useTheme(): {
  theme: Theme;
  toggle: (origin?: ToggleOrigin) => void;
  setTheme: (t: Theme, origin?: ToggleOrigin) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    return readStored() ?? (systemPrefersDark() ? 'dark' : 'light');
  });

  // Mount-only sync. The inline bootstrap in index.html sets the class for
  // the FIRST paint; this catches dev HMR remounts. Subsequent toggles go
  // through setTheme → applyAnimated, which schedules the class swap so it
  // lands UNDER the iris overlay. A [theme] dep here would beat the schedule
  // and snap the page instantly — the iris then expands in the destination
  // colour over a page that already matches it, which is exactly the
  // "animation invisible" symptom.
  useEffect(() => {
    applyClass(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (readStored() !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      const next: Theme = e.matches ? 'dark' : 'light';
      // No click origin → snap, don't iris. System changes are rare and
      // shouldn't startle the user with a full-page reveal.
      applyClass(next);
      setThemeState(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme, origin?: ToggleOrigin) => {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
    applyAnimated(t, origin ?? null);
    setThemeState(t);
  }, []);

  const toggle = useCallback(
    (origin?: ToggleOrigin) => {
      setTheme(theme === 'dark' ? 'light' : 'dark', origin);
    },
    [theme, setTheme]
  );

  return { theme, toggle, setTheme };
}
