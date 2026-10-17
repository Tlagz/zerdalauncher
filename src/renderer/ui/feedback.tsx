import { create } from 'zustand';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef } from 'react';
import { transition } from './viewTransition';
import { Info, CircleCheck, TriangleAlert, Trash2, type LucideIcon } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { playSound } from './sounds';

export type Tone = 'info' | 'success' | 'error';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
export interface AlertOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
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
  /** Playing its exit animation; removed from the list once it finishes. */
  leaving?: boolean;
}

const TOAST_EXIT_MS = 240;

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
  removeToast: (id) => {
    if (!get().toasts.some((t) => t.id === id && !t.leaving)) return;
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)) }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TOAST_EXIT_MS);
  }
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
  if (opts.tone === 'error') playSound('error');
  return new Promise((resolve) => {
    useFeedback.getState().push({ kind: 'alert', options: opts, resolve: () => resolve() });
  });
}

/** Show a transient, non-blocking toast (used for success / minor info). */
export function showToast(message: string, tone: Tone = 'success'): void {
  playSound(tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'toast');
  useFeedback.getState().addToast(message, tone);
}

const TONE_ICON: Record<Tone, LucideIcon> = { info: Info, success: CircleCheck, error: TriangleAlert };

function defaultTitle(item: DialogItem): string {
  const { kind, options } = item;
  if (kind === 'confirm') return options.danger ? 'Na pewno?' : 'Potwierdź';
  return options.tone === 'error' ? 'Coś poszło nie tak' : options.tone === 'success' ? 'Gotowe' : 'Informacja';
}

function DialogView({
  item,
  onRespond,
  onDismiss
}: {
  item: DialogItem;
  onRespond: (v: boolean) => void;
  /** Raw cancel for the backdrop — useBackdropClose already animates it. */
  onDismiss: () => void;
}) {
  const { kind, options } = item;
  const isConfirm = kind === 'confirm';
  const tone: Tone = options.danger ? 'error' : options.tone ?? (isConfirm ? 'info' : 'info');
  const Icon = options.danger ? Trash2 : TONE_ICON[tone];
  const backdrop = useBackdropClose(onDismiss);
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
        <div className={`dialog-icon tone-${tone}`}>
          <Icon size={24} />
        </div>
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

  // Animated close: the dialog zooms out instead of vanishing.
  const respond = useCallback(
    (v: boolean) => transition(() => resolveTop(v), { kind: 'close', closing: document.querySelector('.dialog') }),
    [resolveTop]
  );

  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        respond(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        respond(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [top, respond]);

  return createPortal(
    <>
      {top && <DialogView key={top.id} item={top} onRespond={respond} onDismiss={() => resolveTop(false)} />}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => {
            const ToastIcon = TONE_ICON[t.tone];
            return (
              <div
                key={t.id}
                className={`toast tone-${t.tone} ${t.leaving ? 'leaving' : ''}`}
                role="status"
                onClick={() => removeToast(t.id)}
              >
                <ToastIcon size={18} className="toast-ic" />
                <span className="toast-msg">{t.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </>,
    document.body
  );
}
