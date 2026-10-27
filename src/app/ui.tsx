import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowArcLeft, ArrowArcRight, ArrowClockwise, ArrowCounterClockwise, ArrowLeft, ArrowRight, CameraSlash, CaretDown, CaretUp,
  CheckCircle, CircleDashed, Cube, CursorClick, EyeSlash, FastForward, Flask, FrameCorners, HandGrabbing, Hourglass,
  HourglassMedium, Info, ListBullets, LockSimple, MagnifyingGlassMinus, MagnifyingGlassPlus, Minus, Pause, PencilSimple,
  PersonSimpleWalk, Play, PlayCircle, Plus, Question, Queue, Scales, Shuffle, SlidersHorizontal, Stop, Timer, Trash, UserPlus,
  UsersThree, Warning, X,
} from '@phosphor-icons/react';
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react';

// Phosphor glyphs are decorative (aria-hidden); every control carries a text label or aria-label.
const GLYPHS = {
  play: Play, pause: Pause, fast: FastForward, reset: ArrowCounterClockwise, replay: ArrowClockwise, plus: Plus, minus: Minus,
  stop: Stop, info: Info, lock: LockSimple, trash: Trash, warning: Warning, check: CheckCircle, help: Question, userPlus: UserPlus,
  pencil: PencilSimple, cube: Cube, list: ListBullets, rotateLeft: ArrowArcLeft, rotateRight: ArrowArcRight, zoomIn: MagnifyingGlassPlus,
  zoomOut: MagnifyingGlassMinus, frame: FrameCorners, grab: HandGrabbing, hidden: EyeSlash, hourglass: Hourglass, idle: CircleDashed,
  close: X, next: ArrowRight, back: ArrowLeft, sliders: SlidersHorizontal, playCircle: PlayCircle, cursor: CursorClick, flask: Flask,
  users: UsersThree, timer: Timer, queue: Queue, drain: HourglassMedium, walk: PersonSimpleWalk, shuffle: Shuffle,
  cameraOff: CameraSlash, caretDown: CaretDown, caretUp: CaretUp, scales: Scales,
} satisfies Record<string, PhosphorIcon>;
export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 17, weight = 'bold' }: { name: IconName; size?: number; weight?: IconWeight }) {
  const Glyph = GLYPHS[name];
  return <Glyph className="icon" size={size} weight={weight} aria-hidden="true" focusable="false" />;
}

/** Native modal dialog: focus trap, inert background and Escape come from the platform. */
export function DialogShell({ open, onClose, className = 'dialog', labelledBy, describedBy, children }: {
  open: boolean; onClose: () => void; className?: string; labelledBy: string; describedBy?: string; children: ReactNode;
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
      // Return focus to the trigger; if it disappeared, to the scenario heading.
      const target = returnTo.current.isConnected && !returnTo.current.matches(':disabled') ? returnTo.current : document.getElementById('workspace-title');
      returnTo.current = null;
      target?.focus();
    }
  }, [open]);
  return (
    <dialog ref={ref} className={className} aria-labelledby={labelledBy} aria-describedby={describedBy}
      onClose={() => { if (open) onClose(); }}>
      {children}
    </dialog>
  );
}

export function Dialog({ open, title, description, onClose, children, actions, className }: {
  open: boolean; title: string; description?: ReactNode; onClose: () => void; children?: ReactNode; actions: ReactNode; className?: string;
}) {
  const id = title.replace(/\W+/g, '-').toLowerCase();
  return (
    <DialogShell open={open} onClose={onClose} className={className} labelledBy={`${id}-title`} describedBy={description ? `${id}-desc` : undefined}>
      <h2 id={`${id}-title`}>{title}</h2>
      {description && <div id={`${id}-desc`} className="dialog-description">{description}</div>}
      {children}
      <div className="dialog-actions">{actions}</div>
    </DialogShell>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel, onCancel, onConfirm }: {
  open: boolean; title: string; description: ReactNode; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} title={title} description={description} onClose={onCancel} actions={<>
      {/* Initial focus on Batal for every destructive confirmation. */}
      <button type="button" className="button" autoFocus onClick={onCancel}>Batal</button>
      <button type="button" className="button danger-solid" onClick={onConfirm}>{confirmLabel}</button>
    </>} />
  );
}

export function NumberField({ id, label, aside, unit, value, error, hint, disabled, decimal, onChange, onCommit, before, after, className }: {
  id: string; label: ReactNode; aside?: ReactNode; unit?: string; value: string; error?: string; hint?: ReactNode; disabled?: boolean; decimal?: boolean;
  onChange: (value: string) => void; onCommit: () => void; before?: ReactNode; after?: ReactNode; className?: string;
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <div className="field-head"><label id={`${id}-label`} htmlFor={id}>{label}</label>{aside && <span>{aside}</span>}</div>
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
      {error && <p id={`${id}-error`} className="field-error"><Icon name="warning" size={14} />{error}</p>}
    </div>
  );
}
