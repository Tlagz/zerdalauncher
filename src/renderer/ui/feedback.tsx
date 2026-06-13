import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { useBackdropClose } from '../hooks/useBackdropClose';

export type Tone = 'info' | 'success' | 'error';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  icon?: string;
}
export interface AlertOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  icon?: string;
  tone?: Tone;
}

interface DialogItem {
  id: number;
  kind: 'confirm' | 'alert';
  options: ConfirmOptions & AlertOptions;
  resolve: (v: boolean) => void;
}
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface FeedbackState {
  queue: DialogItem[];
  toasts: ToastItem[];
  push: (item: Omit<DialogItem, 'id'>) => void;
  resolveTop: (v: boolean) => void;
  addToast: (message: string, tone: Tone) => void;
  removeToast: (id: number) => void;
}

let seq = 1;

const useFeedback = create<FeedbackState>((set, get) => ({
  queue: [],
  toasts: [],
  push: (item) => set((s) => ({ queue: [...s.queue, { ...item, id: seq++ }] })),
  resolveTop: (v) => {
    const [top, ...rest] = get().queue;
    if (top) top.resolve(v);
    set({ queue: rest });
  },
  addToast: (message, tone) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => get().removeToast(id), tone === 'error' ? 6500 : 4200);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}));

/** Ask the user to confirm an action. Resolves true on confirm, false otherwise. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useFeedback.getState().push({ kind: 'confirm', options, resolve });
  });
}

/** Show a blocking message with a single OK button (used for errors). */
export function alertDialog(options: AlertOptions | string): Promise<void> {
  const opts: AlertOptions = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    useFeedback.getState().push({ kind: 'alert', options: opts, resolve: () => resolve() });
  });
}

/** Show a transient, non-blocking toast (used for success / minor info). */
export function showToast(message: string, tone: Tone = 'success'): void {
  useFeedback.getState().addToast(message, tone);
}

const TONE_ICON: Record<Tone, string> = { info: 'ℹ️', success: '✅', error: '⚠️' };

function defaultTitle(item: DialogItem): string {
  const { kind, options } = item;
  if (kind === 'confirm') return options.danger ? 'Na pewno?' : 'Potwierdź';
  return options.tone === 'error' ? 'Coś poszło nie tak' : options.tone === 'success' ? 'Gotowe' : 'Informacja';
}

function DialogView({ item, onRespond }: { item: DialogItem; onRespond: (v: boolean) => void }) {
  const { kind, options } = item;
  const isConfirm = kind === 'confirm';
  const tone: Tone = options.danger ? 'error' : options.tone ?? (isConfirm ? 'info' : 'info');
  const icon = options.icon ?? (options.danger ? '🗑️' : TONE_ICON[tone]);
  const backdrop = useBackdropClose(() => onRespond(false));
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus the safe action by default on destructive prompts.
  useEffect(() => {
    (options.danger ? cancelRef : confirmRef).current?.focus();
  }, [options.danger]);

  return (
    <div className="modal-backdrop dialog-backdrop" {...backdrop}>
      <div
        className={`modal dialog tone-${tone}`}
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`dialog-icon tone-${tone}`}>{icon}</div>
        <h3 className="dialog-title">{options.title ?? defaultTitle(item)}</h3>
        <p className="dialog-message">{options.message}</p>
        <div className="dialog-actions">
          {isConfirm && (
            <button ref={cancelRef} className="ghost" onClick={() => onRespond(false)}>
              {options.cancelLabel ?? 'Anuluj'}
            </button>
          )}
          <button
            ref={confirmRef}
            className={options.danger ? 'danger' : 'primary'}
            onClick={() => onRespond(true)}
          >
            {options.confirmLabel ?? (isConfirm ? (options.danger ? 'Usuń' : 'Potwierdź') : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mounted once at the app root; renders the active dialog + toast stack. */
export function FeedbackHost() {
  const top = useFeedback((s) => s.queue[0]);
  const toasts = useFeedback((s) => s.toasts);
  const resolveTop = useFeedback((s) => s.resolveTop);
  const removeToast = useFeedback((s) => s.removeToast);

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        resolveTop(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        resolveTop(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, resolveTop]);

  return createPortal(
    <>
      {top && <DialogView key={top.id} item={top} onRespond={resolveTop} />}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast tone-${t.tone}`}
              role="status"
              onClick={() => removeToast(t.id)}
            >
              <span className="toast-ic">{TONE_ICON[t.tone]}</span>
              <span className="toast-msg">{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </>,
    document.body
  );
}
