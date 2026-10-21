import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, FolderOpen, Earth, Save, Trash2, Loader2, MapPinned } from 'lucide-react';
import { WorldMapModal } from './WorldMapModal';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog } from '../ui/feedback';
import { ModalHeader } from '../ui/ModalHeader';
import { formatDate, formatSize } from '../format';
import type { Instance, WorldInfo } from '../../shared/types';

export function WorldsModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapOf, setMapOf] = useState<string | null>(null);
  const backdrop = useBackdropClose(onClose);

  const load = async () => {
    setLoading(true);
    try {
      setWorlds(await window.api.worlds.list(instance.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const backup = async (w: WorldInfo) => {
    setBusy(w.name);
    setError(null);
    setMsg(null);
    try {
      const p = await window.api.worlds.backup(instance.id, w.name);
      setMsg(`✓ Kopia zapisana: ${p}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const del = async (w: WorldInfo) => {
    const ok = await confirmDialog({
      title: 'Usunąć świat?',
      message: `Świat „${w.name}" zostanie usunięty. Tej operacji nie da się cofnąć.`,
      danger: true,
      confirmLabel: 'Usuń świat'
    });
    if (!ok) return;
    await window.api.worlds.delete(instance.id, w.name);
    load();
  };
  const restore = async () => {
    setError(null);
    setMsg(null);
    try {
      const res = await window.api.worlds.restore(instance.id);
      if (res) {
        setWorlds(res);
        setMsg('✓ Świat przywrócony z kopii.');
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal" onClick={(e) => e.stopPropagation()}>
        <ModalHeader
          title={`Światy i kopie — ${instance.name}`}
          subtitle="Twórz kopie zapasowe światów i przywracaj je z plików .zip"
          onClose={onClose}
        />

        <div className="installed-toolbar">
          <button className="ghost" onClick={restore}>
            <ArchiveRestore size={16} /> Przywróć z kopii…
          </button>
          <button className="ghost" onClick={() => window.api.worlds.openFolder(instance.id)}>
            <FolderOpen size={16} /> Folder zapisów
          </button>
        </div>

        {msg && <div className="picker-note">{msg}</div>}
        {error && <div className="error">{error}</div>}

        <div className="mod-list">
          {loading && <div className="mod-empty">Wczytuję światy…</div>}
          {!loading && worlds.length === 0 && (
            <div className="mod-empty">Brak światów (jeszcze nic nie zagrane na tej instancji).</div>
          )}
          {worlds.map((w) => (
            <div className="mod-row" key={w.name}>
              <div className="mod-icon placeholder">
                <Earth size={22} />
              </div>
              <div className="mod-info">
                <div className="mod-title">{w.name}</div>
                <div className="mod-sub">
                  {formatSize(w.sizeMb * 1024 * 1024) || '< 1 KB'}
                  {w.lastPlayed ? ` · ostatnio: ${formatDate(w.lastPlayed)}` : ''}
                </div>
              </div>
              <button className="ghost" onClick={() => setMapOf(w.name)} title="Mapa świata z lotu ptaka">
                <MapPinned size={15} /> Mapa
              </button>
              <button className="primary" disabled={busy === w.name} onClick={() => backup(w)}>
                {busy === w.name ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
                {busy === w.name ? 'Tworzę…' : 'Kopia'}
              </button>
              <button className="danger icon-btn" onClick={() => del(w)} title="Usuń świat">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {mapOf && (
        <WorldMapModal
          target={{ kind: 'instance', instanceId: instance.id, world: mapOf }}
          title={mapOf}
          onClose={() => setMapOf(null)}
        />
      )}
    </div>,
    document.body
  );
}
