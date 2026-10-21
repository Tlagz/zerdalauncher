import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, FolderOpen } from 'lucide-react';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { ModalHeader } from '../ui/ModalHeader';
import { formatDate, plural } from '../format';
import { ScreenshotViewer } from './ScreenshotViewer';
import type { Instance, ScreenshotEntry } from '../../shared/types';

/** Grid of an instance's screenshots with a full-size viewer. */
export function ScreenshotsModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [shots, setShots] = useState<ScreenshotEntry[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const backdrop = useBackdropClose(onClose);
  const api = window.api.screenshots;

  useEffect(() => {
    api
      .list(instance.id)
      .then((list) => setShots(list.map((s) => ({ ...s, instanceId: instance.id }))))
      .catch(() => setShots([]));
  }, [instance.id]);

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

        {shots && open !== null && (
          <ScreenshotViewer
            shots={shots}
            index={open}
            onIndex={setOpen}
            onDeleted={(gone) => {
              const next = shots.filter((s) => s !== gone);
              setShots(next);
              setOpen(next.length ? Math.min(open, next.length - 1) : null);
            }}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
