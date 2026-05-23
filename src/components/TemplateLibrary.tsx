import { useDraggable } from '@dnd-kit/core';
import { useStore } from '../store';
import { TemplateCard } from './TemplateCard';
import type { Template } from '../types';

type Props = {
  activeDragId: string | null;
};

function LibraryItem({ template, isDragging }: { template: Template; isDragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `tpl:${template.id}`,
    data: { kind: 'template', templateId: template.id },
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      <TemplateCard template={template} variant="library" dragging={isDragging} />
    </div>
  );
}

export function TemplateLibrary({ activeDragId }: Props) {
  const templates = useStore((s) => s.templates);
  const loadTemplates = useStore((s) => s.loadTemplates);
  const templatesLoading = useStore((s) => s.templatesLoading);
  const templatesError = useStore((s) => s.templatesError);

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="text-sm font-semibold text-neutral-900">Templates</div>
        <div className="text-xs text-neutral-500">
          Catalog from <span className="font-mono">/templates.json</span> — drag onto the builder
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {templatesError && (
          <div className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            <div className="font-semibold">Couldn't load templates.json</div>
            <div className="mt-0.5 truncate font-mono text-[10px] text-rose-600/80">{templatesError}</div>
            <button
              onClick={() => void loadTemplates()}
              className="mt-1.5 rounded border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
            >
              Retry
            </button>
          </div>
        )}
        {templatesLoading && templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500">
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-md border border-dashed border-neutral-300 px-3 py-6 text-center text-xs text-neutral-500">
            No templates in the catalog.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
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
