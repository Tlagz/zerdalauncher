import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, Copy, FolderOpen, Trash2, ChevronLeft, ChevronRight, X, FolderSearch } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { confirmDialog, showToast } from '../ui/feedback';
import { formatDate, formatSize, plural } from '../format';
import type { Instance, ScreenshotInfo } from '../../shared/types';

/** Grid of an instance's screenshots with a full-size viewer. */
export function ScreenshotsModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [shots, setShots] = useState<ScreenshotInfo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const backdrop = useBackdropClose(onClose);
  const api = window.api.screenshots;

  useEffect(() => {
    api.list(instance.id).then(setShots).catch(() => setShots([]));
  }, [instance.id]);

  const current = open !== null && shots ? shots[open] : null;
  const step = (d: number) => shots && open !== null && setOpen((open + d + shots.length) % shots.length);

  // Arrow keys flip through the viewer; Escape closes it (not the whole modal).
  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, shots]);

  const copy = async (s: ScreenshotInfo) => {
    try {
      await api.copy(instance.id, s.name);
      showToast('Skopiowano obraz do schowka.', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };
  const remove = async (s: ScreenshotInfo) => {
    const ok = await confirmDialog({
      title: 'Usunąć zrzut ekranu?',
      message: `„${s.name}" trafi do kosza — możesz go stamtąd przywrócić.`,
      danger: true,
      confirmLabel: 'Do kosza'
    });
    if (!ok) return;
    const next = await api.delete(instance.id, s.name);
    setShots(next);
    if (open !== null) setOpen(next.length ? Math.min(open, next.length - 1) : null);
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal shots-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={`Zrzuty ekranu — ${instance.name}`}
          subtitle={
            shots
              ? shots.length
                ? `${shots.length} ${plural(shots.length, 'zrzut', 'zrzuty', 'zrzutów')} · F2 w grze robi nowy`
                : 'F2 w grze robi zrzut ekranu'
              : 'Wczytuję…'
          }
          onClose={onClose}
        />
        <div className="installed-toolbar">
          <button className="ghost" onClick={() => api.openFolder(instance.id)}>
            <FolderOpen size={16} /> Otwórz folder
          </button>
        </div>

        {shots && shots.length === 0 && (
          <div className="mod-empty shots-empty">
            <Camera size={30} />
            <div>Brak zrzutów ekranu. Naciśnij F2 w grze, a pojawią się tutaj.</div>
          </div>
        )}
        {shots && shots.length > 0 && (
          <div className="shots-grid">
            {shots.map((s, i) => (
              <button className="shot-card" key={s.name} onClick={() => setOpen(i)} title={s.name}>
                <img src={api.url(instance.id, s.name, true)} alt="" loading="lazy" />
                <span className="shot-meta">{formatDate(s.takenAt)}</span>
              </button>
            ))}
          </div>
        )}

        {/* The modal's backdrop-filter would trap a fixed overlay, so the viewer lives on <body>. */}
        {current && createPortal(
          <div className="shot-viewer" onClick={() => setOpen(null)}>
            <img src={api.url(instance.id, current.name)} alt={current.name} onClick={(e) => e.stopPropagation()} />
            {shots!.length > 1 && (
              <>
                <button className="ghost icon-btn shot-nav prev" onClick={(e) => (e.stopPropagation(), step(-1))} aria-label="Poprzedni">
                  <ChevronLeft size={22} />
                </button>
                <button className="ghost icon-btn shot-nav next" onClick={(e) => (e.stopPropagation(), step(1))} aria-label="Następny">
                  <ChevronRight size={22} />
                </button>
              </>
            )}
            <div className="shot-bar" onClick={(e) => e.stopPropagation()}>
              <span className="shot-bar-name truncate">
                {current.name} · {formatSize(current.size)}
              </span>
              <button className="ghost btn-sm" onClick={() => copy(current)}>
                <Copy size={14} /> Kopiuj
              </button>
              <button className="ghost btn-sm" onClick={() => api.reveal(instance.id, current.name)}>
                <FolderSearch size={14} /> Pokaż w folderze
              </button>
              <button className="danger btn-sm" onClick={() => remove(current)}>
                <Trash2 size={14} /> Usuń
              </button>
              <button className="ghost icon-btn" onClick={() => setOpen(null)} aria-label="Zamknij podgląd">
                <X size={18} />
              </button>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>,
    document.body
  );
}
