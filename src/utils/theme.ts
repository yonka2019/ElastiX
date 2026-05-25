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

// Two-track animation:
//   1. Chromium/Safari with startViewTransition: a clip-path circle expands
//      from the click origin, sweeping the new theme over the old one.
//      Keyframes live in index.css and read --theme-tx-x / --theme-tx-y
//      from the documentElement.
//   2. Browsers without VT (Firefox today): the .theme-transitioning class
//      tweens background-color / color / border-color across the page for
//      ~320ms. Class is removed after the longest transition so steady-state
//      hovers are not affected.
function applyAnimated(theme: Theme, origin: ToggleOrigin | null) {
  if (prefersReducedMotion()) {
    applyClass(theme);
    return;
  }

  const root = document.documentElement;

  if (origin) {
    root.style.setProperty('--theme-tx-x', `${origin.x}px`);
    root.style.setProperty('--theme-tx-y', `${origin.y}px`);
  } else {
    root.style.setProperty('--theme-tx-x', '50%');
    root.style.setProperty('--theme-tx-y', '50%');
  }

  root.classList.add('theme-transitioning');
  window.setTimeout(() => root.classList.remove('theme-transitioning'), 520);

  const startVT = (document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  }).startViewTransition;

  if (typeof startVT === 'function') {
    startVT.call(document, () => applyClass(theme));
  } else {
    applyClass(theme);
  }
}

export function useTheme(): {
  theme: Theme;
  toggle: (origin?: ToggleOrigin) => void;
  setTheme: (t: Theme, origin?: ToggleOrigin) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => {
    return readStored() ?? (systemPrefersDark() ? 'dark' : 'light');
  });

  // Apply on mount so the initial DOM matches the chosen theme (the bootstrap
  // script in index.html handles this for the FIRST paint, but on dev HMR
  // remounts we still need to sync). Direct, no animation: there is no
  // visible transition on first render.
  useEffect(() => {
    applyClass(theme);
  }, [theme]);

  useEffect(() => {
    if (readStored() !== null) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setThemeState(e.matches ? 'dark' : 'light');
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
