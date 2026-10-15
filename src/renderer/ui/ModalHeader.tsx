import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { closeWithTransition } from './viewTransition';

/** Title + optional subtitle + close button, shared by all content modals. */
export function ModalHeader({
  title,
  subtitle,
  onClose,
  closeDisabled
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <div className="mod-modal-head">
      <div className="modal-head-text">
        <h3 className="modal-title">{title}</h3>
        {subtitle && <div className="modal-subtitle">{subtitle}</div>}
      </div>
      <button
        className="ghost icon-btn modal-close"
        onClick={(e) => closeWithTransition(e.currentTarget, onClose)}
        disabled={closeDisabled}
        aria-label="Zamknij"
        title="Zamknij"
      >
        <X size={18} />
      </button>
    </div>
  );
}
