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
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 dark:bg-black/60"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-pop flex max-h-[70vh] w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
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
