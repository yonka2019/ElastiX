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
        'group relative select-none rounded-md border px-3 py-2.5 transition-shadow',
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
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
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
