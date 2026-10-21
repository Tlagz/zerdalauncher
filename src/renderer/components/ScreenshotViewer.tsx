import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Trash2, ChevronLeft, ChevronRight, X, FolderSearch } from 'lucide-react';
import { confirmDialog, showToast } from '../ui/feedback';
import { formatDate, formatSize } from '../format';
import type { ScreenshotEntry } from '../../shared/types';

/**
 * Full-window screenshot viewer (arrows flip, Escape closes). Rendered on
 * <body>: a modal's backdrop-filter would otherwise trap the fixed overlay.
 */
export function ScreenshotViewer({
  shots,
  index,
  onIndex,
  onDeleted
}: {
  shots: ScreenshotEntry[];
  index: number;
  onIndex: (i: number | null) => void;
  onDeleted: (shot: ScreenshotEntry) => void;
}) {
  const api = window.api.screenshots;
  const current = shots[index];
  const step = (d: number) => onIndex((index + d + shots.length) % shots.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Escape') {
        e.stopPropagation();
        onIndex(null);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, shots]);

  if (!current) return null;

  const copy = async () => {
    try {
      await api.copy(current.instanceId, current.name);
      showToast('Skopiowano obraz do schowka.', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Usunąć zrzut ekranu?',
      message: `„${current.name}" trafi do kosza — możesz go stamtąd przywrócić.`,
      danger: true,
      confirmLabel: 'Do kosza'
    });
    if (!ok) return;
    await api.delete(current.instanceId, current.name);
    onDeleted(current);
  };

  return createPortal(
    <div className="shot-viewer" onClick={() => onIndex(null)}>
      <img src={api.url(current.instanceId, current.name)} alt={current.name} onClick={(e) => e.stopPropagation()} />
      {shots.length > 1 && (
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
          {current.instanceName ? `${current.instanceName} · ` : ''}
          {formatDate(current.takenAt)} · {formatSize(current.size)} · {index + 1}/{shots.length}
        </span>
        <button className="ghost btn-sm" onClick={copy}>
          <Copy size={14} /> Kopiuj
        </button>
        <button className="ghost btn-sm" onClick={() => api.reveal(current.instanceId, current.name)}>
          <FolderSearch size={14} /> Pokaż w folderze
        </button>
        <button className="danger btn-sm" onClick={remove}>
          <Trash2 size={14} /> Usuń
        </button>
        <button className="ghost icon-btn" onClick={() => onIndex(null)} aria-label="Zamknij podgląd">
          <X size={18} />
        </button>
      </div>
    </div>,
    document.body
  );
}
