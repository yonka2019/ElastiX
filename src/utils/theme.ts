import { useCallback } from 'react';
import { create } from 'zustand';

type Theme = 'light' | 'dark';
export type LightTint = 'classic' | 'mist' | 'sand' | 'sage';
export type DarkTint = 'classic' | 'midnight' | 'forest' | 'plum';

const STORAGE_KEY = 'elastix-theme';
const TINT_LIGHT_KEY = 'elastix-tint-light';
const TINT_DARK_KEY = 'elastix-tint-dark';

// Swatches shown in Settings. The CSS for each tint lives in index.css under
// html[data-tint='…'] — tints recolour the neutral surfaces only, accents
// (mode colors, buttons) stay as-is so their meaning never shifts.
export const LIGHT_TINTS: ReadonlyArray<{ id: LightTint; label: string; swatch: string }> = [
  { id: 'classic', label: 'Classic', swatch: '#fafafa' },
  { id: 'mist', label: 'Mist', swatch: '#dbe6f1' },
  { id: 'sand', label: 'Sand', swatch: '#ece2cc' },
  { id: 'sage', label: 'Sage', swatch: '#dce9dc' },
];
export const DARK_TINTS: ReadonlyArray<{ id: DarkTint; label: string; swatch: string }> = [
  { id: 'classic', label: 'Classic', swatch: '#171717' },
  { id: 'midnight', label: 'Midnight', swatch: '#101b33' },
  { id: 'forest', label: 'Forest', swatch: '#10271a' },
  { id: 'plum', label: 'Plum', swatch: '#1f1433' },
];

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function readTint<T extends string>(key: string, allowed: ReadonlyArray<{ id: T }>): T {
  try {
    const v = localStorage.getItem(key);
    const hit = allowed.find((t) => t.id === v);
    return hit ? hit.id : ('classic' as T);
  } catch {
    return 'classic' as T;
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

// The active tint rides on a data attribute; index.css scopes the surface
// overrides to html[data-tint='…'] (light) / html.dark[data-tint='…'] (dark).
function applyTint(theme: Theme, lightTint: LightTint, darkTint: DarkTint) {
  const tint = theme === 'dark' ? darkTint : lightTint;
  const root = document.documentElement;
  if (tint === 'classic') delete root.dataset.tint;
  else root.dataset.tint = tint;
}

// Origin point kept for API compatibility with the header toggle.
type ToggleOrigin = { x: number; y: number };

// Smooth crossfade of every coloured element between themes/tints. We add a
// short-lived `theme-transition` class to <html>, force a style recalc so
// the transition is committed BEFORE the class/attr swap (otherwise the
// browser batches both and the change snaps), flip the theme, then drop the
// class so hover / focus / drag transitions go back to their normal cadence.
const TRANSITION_MS = 220;

function withCrossfade(mutate: () => void) {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  // Reading offsetWidth flushes pending style/layout in the same tick.
  void root.offsetWidth;
  mutate();
  window.setTimeout(() => {
    root.classList.remove('theme-transition');
  }, TRANSITION_MS);
}

// Module-level zustand store so every useTheme() consumer (header toggle,
// Settings panel, …) shares ONE state and stays in sync.
const useThemeStore = create<{ theme: Theme; lightTint: LightTint; darkTint: DarkTint }>(() => ({
  theme: readStored() ?? (systemPrefersDark() ? 'dark' : 'light'),
  lightTint: readTint(TINT_LIGHT_KEY, LIGHT_TINTS),
  darkTint: readTint(TINT_DARK_KEY, DARK_TINTS),
}));

if (typeof document !== 'undefined') {
  // Mount-time sync. The inline bootstrap in index.html covers the FIRST
  // paint; this catches dev HMR remounts and any drift.
  const s = useThemeStore.getState();
  applyClass(s.theme);
  applyTint(s.theme, s.lightTint, s.darkTint);

  // Follow the OS preference while the user hasn't picked a theme explicitly.
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', (e) => {
    if (readStored() !== null) return;
    const next: Theme = e.matches ? 'dark' : 'light';
    // No click origin → snap, don't animate. System changes are rare and
    // shouldn't startle the user.
    applyClass(next);
    const cur = useThemeStore.getState();
    applyTint(next, cur.lightTint, cur.darkTint);
    useThemeStore.setState({ theme: next });
  });
}

function setThemeImpl(t: Theme, _origin?: ToggleOrigin) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
  const { lightTint, darkTint } = useThemeStore.getState();
  withCrossfade(() => {
    applyClass(t);
    applyTint(t, lightTint, darkTint);
  });
  useThemeStore.setState({ theme: t });
}

function setLightTintImpl(tint: LightTint) {
  try {
    localStorage.setItem(TINT_LIGHT_KEY, tint);
  } catch {
    /* ignore */
  }
  const { theme, darkTint } = useThemeStore.getState();
  withCrossfade(() => applyTint(theme, tint, darkTint));
  useThemeStore.setState({ lightTint: tint });
}

function setDarkTintImpl(tint: DarkTint) {
  try {
    localStorage.setItem(TINT_DARK_KEY, tint);
  } catch {
    /* ignore */
  }
  const { theme, lightTint } = useThemeStore.getState();
  withCrossfade(() => applyTint(theme, lightTint, tint));
  useThemeStore.setState({ darkTint: tint });
}

export function useTheme(): {
  theme: Theme;
  lightTint: LightTint;
  darkTint: DarkTint;
  toggle: (origin?: ToggleOrigin) => void;
  setTheme: (t: Theme, origin?: ToggleOrigin) => void;
  setLightTint: (t: LightTint) => void;
  setDarkTint: (t: DarkTint) => void;
} {
  const theme = useThemeStore((s) => s.theme);
  const lightTint = useThemeStore((s) => s.lightTint);
  const darkTint = useThemeStore((s) => s.darkTint);

  const toggle = useCallback(
    (origin?: ToggleOrigin) => {
      setThemeImpl(useThemeStore.getState().theme === 'dark' ? 'light' : 'dark', origin);
    },
    []
  );

  return {
    theme,
    lightTint,
    darkTint,
    toggle,
    setTheme: setThemeImpl,
    setLightTint: setLightTintImpl,
    setDarkTint: setDarkTintImpl,
  };
}
