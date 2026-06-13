import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { confirmDialog } from '../ui/feedback';
import type { Instance, WorldInfo } from '../../shared/types';

function fmtSize(mb: number): string {
  return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.max(1, Math.round(mb)) + ' MB';
}
function fmtDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function WorldsModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Światy i kopie — {instance.name}</h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              Twórz kopie zapasowe światów i przywracaj je z plików .zip
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="installed-toolbar">
          <button className="ghost" onClick={restore}>
            📥 Przywróć z kopii…
          </button>
          <button className="ghost" onClick={() => window.api.worlds.openFolder(instance.id)}>
            📂 Folder zapisów
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
              <div className="mod-icon placeholder">🌍</div>
              <div className="mod-info">
                <div className="mod-title">{w.name}</div>
                <div className="mod-sub">
                  {fmtSize(w.sizeMb)}
                  {w.lastPlayed ? ` · ostatnio: ${fmtDate(w.lastPlayed)}` : ''}
                </div>
              </div>
              <button className="primary" disabled={busy === w.name} onClick={() => backup(w)}>
                {busy === w.name ? 'Tworzę…' : '💾 Kopia'}
              </button>
              <button className="danger" onClick={() => del(w)} title="Usuń świat">
                🗑
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
