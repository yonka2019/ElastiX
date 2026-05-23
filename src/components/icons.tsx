import type { BoolMode } from '../types';

type IconProps = { className?: string };

export function ElastixLogo({ className = 'h-7 w-7' }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-label="ElastiX logo"
      role="img"
    >
      <defs>
        <linearGradient id="elastix-must" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#059669" />
        </linearGradient>
        <linearGradient id="elastix-should" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id="elastix-not" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="1" stopColor="#e11d48" />
        </linearGradient>
      </defs>
      <rect x="3" y="4.5" width="18" height="3.5" rx="1.75" fill="url(#elastix-must)" />
      <rect x="5" y="10.25" width="14" height="3.5" rx="1.75" fill="url(#elastix-should)" />
      <rect x="7" y="16" width="10" height="3.5" rx="1.75" fill="url(#elastix-not)" />
    </svg>
  );
}

export function ModeIcon({ mode, className = 'h-4 w-4' }: { mode: BoolMode } & IconProps) {
  if (mode === 'must') {
    // Bold check — "must match"
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label="must"
        role="img"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  if (mode === 'should') {
    // Star — "boosts score if matched"
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        fill="currentColor"
        aria-label="should"
        role="img"
      >
        <path d="M12 2.6l2.85 6.14 6.65.96-4.93 4.65 1.27 6.8L12 17.95l-5.84 3.2 1.27-6.8L2.5 9.7l6.65-.96z" />
      </svg>
    );
  }
  // must_not — banned / no-entry
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-label="must_not"
      role="img"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}
