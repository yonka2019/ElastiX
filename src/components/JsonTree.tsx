import { useState, type ReactNode } from 'react';

type Props = { value: unknown };

export function JsonTree({ value }: Props) {
  return (
    <div className="font-mono text-[12px] leading-relaxed text-neutral-800 dark:text-neutral-200">
      <Node value={value} depth={0} isLast />
    </div>
  );
}

function Node({
  value,
  depth,
  isLast,
  keyLabel,
}: {
  value: unknown;
  depth: number;
  isLast: boolean;
  keyLabel?: string;
}) {
  const pad = { paddingLeft: depth * 12 };
  const comma = isLast ? '' : ',';

  if (value === null) return <Line pad={pad} keyLabel={keyLabel}><Null />{comma}</Line>;
  if (typeof value === 'boolean') return <Line pad={pad} keyLabel={keyLabel}><Bool v={value} />{comma}</Line>;
  if (typeof value === 'number') return <Line pad={pad} keyLabel={keyLabel}><Num v={value} />{comma}</Line>;
  if (typeof value === 'string') return <Line pad={pad} keyLabel={keyLabel}><Str v={value} />{comma}</Line>;
  if (Array.isArray(value)) return <ArrayNode arr={value} depth={depth} comma={comma} keyLabel={keyLabel} />;
  if (typeof value === 'object') return <ObjectNode obj={value as Record<string, unknown>} depth={depth} comma={comma} keyLabel={keyLabel} />;
  return <Line pad={pad} keyLabel={keyLabel}><span className="text-neutral-400">{String(value)}</span>{comma}</Line>;
}

function Line({ pad, keyLabel, children }: { pad: { paddingLeft: number }; keyLabel?: string; children: ReactNode }) {
  return (
    <div style={pad} className="whitespace-pre">
      {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
      {children}
    </div>
  );
}

function ObjectNode({
  obj,
  depth,
  comma,
  keyLabel,
}: {
  obj: Record<string, unknown>;
  depth: number;
  comma: string;
  keyLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const keys = Object.keys(obj);
  const empty = keys.length === 0;
  const pad = { paddingLeft: depth * 12 };

  if (empty) {
    return (
      <Line pad={pad} keyLabel={keyLabel}>
        <Punct>{'{}'}</Punct>{comma}
      </Line>
    );
  }

  return (
    <div>
      <div style={pad} className="flex items-start whitespace-pre">
        <Toggle open={open} onClick={() => setOpen((v) => !v)} />
        {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
        <Punct>{'{'}</Punct>
        {!open && (
          <span className="text-neutral-400 dark:text-neutral-500">
            {` … ${keys.length} ${keys.length === 1 ? 'key' : 'keys'} `}
            <Punct>{'}'}</Punct>
            {comma}
          </span>
        )}
      </div>
      {open && (
        <>
          {keys.map((k, i) => (
            <Node key={k} value={obj[k]} depth={depth + 1} isLast={i === keys.length - 1} keyLabel={k} />
          ))}
          <div style={pad} className="whitespace-pre">
            <Punct>{'}'}</Punct>{comma}
          </div>
        </>
      )}
    </div>
  );
}

function ArrayNode({
  arr,
  depth,
  comma,
  keyLabel,
}: {
  arr: unknown[];
  depth: number;
  comma: string;
  keyLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const empty = arr.length === 0;
  const pad = { paddingLeft: depth * 12 };

  if (empty) {
    return (
      <Line pad={pad} keyLabel={keyLabel}>
        <Punct>{'[]'}</Punct>{comma}
      </Line>
    );
  }

  return (
    <div>
      <div style={pad} className="flex items-start whitespace-pre">
        <Toggle open={open} onClick={() => setOpen((v) => !v)} />
        {keyLabel !== undefined && <><Key k={keyLabel} /><Punct>: </Punct></>}
        <Punct>{'['}</Punct>
        {!open && (
          <span className="text-neutral-400 dark:text-neutral-500">
            {` … ${arr.length} ${arr.length === 1 ? 'item' : 'items'} `}
            <Punct>{']'}</Punct>
            {comma}
          </span>
        )}
      </div>
      {open && (
        <>
          {arr.map((v, i) => (
            <Node key={i} value={v} depth={depth + 1} isLast={i === arr.length - 1} />
          ))}
          <div style={pad} className="whitespace-pre">
            <Punct>{']'}</Punct>{comma}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      aria-label={open ? 'Collapse' : 'Expand'}
    >
      {open ? '▾' : '▸'}
    </button>
  );
}

function Key({ k }: { k: string }) {
  return <span className="text-sky-700 dark:text-sky-300">"{k}"</span>;
}
function Str({ v }: { v: string }) {
  return <span className="text-emerald-700 dark:text-emerald-300">"{v}"</span>;
}
function Num({ v }: { v: number }) {
  return <span className="text-amber-700 dark:text-amber-400">{v}</span>;
}
function Bool({ v }: { v: boolean }) {
  return <span className="text-rose-700 dark:text-rose-400">{String(v)}</span>;
}
function Null() {
  return <span className="text-rose-700 dark:text-rose-400">null</span>;
}
function Punct({ children }: { children: ReactNode }) {
  return <span className="text-neutral-500 dark:text-neutral-400">{children}</span>;
}
