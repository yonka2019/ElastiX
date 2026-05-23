import type { Template } from '../types';

type Props = {
  template: Template;
  variant?: 'library' | 'overlay' | 'builder';
  dragging?: boolean;
};

export function TemplateCard({ template, variant = 'library', dragging }: Props) {
  const overlay = variant === 'overlay';
  return (
    <div
      className={[
        'group rounded-md border bg-white px-3 py-2.5 transition-shadow',
        overlay ? 'border-blue-500 shadow-xl ring-2 ring-blue-200 -rotate-1 scale-[1.02]' : 'border-neutral-200',
        !overlay && !dragging ? 'hover:border-neutral-400 hover:shadow-sm' : '',
        dragging ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div>
        <div className="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 shrink-0 text-blue-600"
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
          <span className="font-semibold text-sm text-neutral-900">{template.name}</span>
        </div>
        {template.description && (
          <div className="mt-0.5 text-xs text-neutral-500">{template.description}</div>
        )}
      </div>
    </div>
  );
}
