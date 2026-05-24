import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { JsonPreviewModal } from '../components/JsonPreviewModal';

type PreviewValue = { title: string; value: unknown } | null;

type Ctx = {
  open: (title: string, value: unknown) => void;
  close: () => void;
};

const PreviewContext = createContext<Ctx | null>(null);

export function PreviewProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PreviewValue>(null);

  const open = useCallback((title: string, value: unknown) => {
    setState({ title, value });
  }, []);
  const close = useCallback(() => setState(null), []);

  const ctx = useMemo<Ctx>(() => ({ open, close }), [open, close]);

  return (
    <PreviewContext.Provider value={ctx}>
      {children}
      <JsonPreviewModal
        open={state !== null}
        title={state?.title ?? ''}
        value={state?.value}
        onClose={close}
      />
    </PreviewContext.Provider>
  );
}

export function usePreview(): Ctx {
  const v = useContext(PreviewContext);
  if (!v) throw new Error('usePreview must be used inside <PreviewProvider>');
  return v;
}
