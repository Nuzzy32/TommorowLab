import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Minimal local glyphs (decorative, aria-hidden); every control carries a text label.
const GLYPHS = {
  play: <path d="M6 4.5v11l9-5.5z" fill="currentColor" stroke="none" />,
  pause: <path d="M6.5 4.5v11M13.5 4.5v11" strokeWidth="2.5" />,
  fast: <path d="M3.5 5v10l6-5zM10.5 5v10l6-5z" fill="currentColor" stroke="none" />,
  reset: <><path d="M4 4.5V8h3.5" /><path d="M4.6 7.5a6 6 0 1 1-.4 4.8" /></>,
  replay: <><path d="M16 4.5V8h-3.5" /><path d="M15.4 7.5a6 6 0 1 0 .4 4.8" /></>,
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  minus: <path d="M4.5 10h11" />,
  stop: <rect x="5" y="5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />,
  info: <><circle cx="10" cy="10" r="7" /><path d="M10 9v5M10 6.2v.1" /></>,
  lock: <><rect x="4.5" y="9" width="11" height="7.5" rx="1.5" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>,
  trash: <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6" />,
  warning: <><path d="M10 3.5l7 12.5H3z" /><path d="M10 8.5v3.5M10 14v.1" /></>,
  check: <path d="M4.5 10.5l3.5 3.5 7.5-8" />,
};
export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {GLYPHS[name]}
    </svg>
  );
}

/** Native modal dialog: focus trap, inert background and Escape come from the platform. */
export function Dialog({ open, title, description, onClose, children, actions }: {
  open: boolean; title: string; description?: ReactNode; onClose: () => void; children?: ReactNode; actions: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) dialog.close();
    if (!open && returnTo.current) {
      // Return focus to the trigger; if it disappeared, to the main heading.
      const target = returnTo.current.isConnected && !returnTo.current.matches(':disabled') ? returnTo.current : document.getElementById('workspace-title');
      returnTo.current = null;
      target?.focus();
    }
  }, [open]);
  const id = title.replace(/\W+/g, '-').toLowerCase();
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-desc` : undefined}
      onClose={() => { if (open) onClose(); }}>
      <h2 id={`${id}-title`}>{title}</h2>
      {description && <div id={`${id}-desc`} className="dialog-description">{description}</div>}
      {children}
      <div className="dialog-actions">{actions}</div>
    </dialog>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: {
  open: boolean; title: string; description: ReactNode; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} title={title} description={description} onClose={onCancel} actions={<>
      {/* Initial focus on Batal for every destructive confirmation. */}
      <button type="button" className="button secondary" autoFocus onClick={onCancel}>Batal</button>
      <button type="button" className="button danger-solid" onClick={onConfirm}>{confirmLabel}</button>
    </>} />
  );
}

export function NumberField({ id, label, unit, value, error, hint, disabled, decimal, onChange, onCommit, before, after }: {
  id: string; label: string; unit?: string; value: string; error?: string; hint?: ReactNode; disabled?: boolean; decimal?: boolean;
  onChange: (value: string) => void; onCommit: () => void; before?: ReactNode; after?: ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label id={`${id}-label`} htmlFor={id}>{label}</label>
      <div className="field-row">
        {before}
        <div className={`field-control${error ? ' invalid' : ''}`}>
          <input id={id} type="text" inputMode={decimal ? 'decimal' : 'numeric'} autoComplete="off" value={value}
            disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
            onChange={event => onChange(event.target.value)} onBlur={onCommit}
            onKeyDown={event => { if (event.key === 'Enter') onCommit(); }} />
          {unit && <span className="unit" aria-hidden="true">{unit}</span>}
        </div>
        {after}
      </div>
      {hint && <p id={`${id}-hint`} className="field-hint">{hint}</p>}
      {error && <p id={`${id}-error`} className="field-error"><Icon name="warning" size={16} />{error}</p>}
    </div>
  );
}
