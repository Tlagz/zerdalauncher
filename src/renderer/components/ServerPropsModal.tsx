import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose } from '../hooks/useBackdropClose';
import type { ServerInstance } from '../../shared/types';

const FIELDS: Array<{ key: string; label: string; type?: 'text' | 'number' | 'bool' | 'select'; options?: string[] }> = [
  { key: 'motd', label: 'MOTD (opis)' },
  { key: 'server-port', label: 'Port', type: 'number' },
  { key: 'max-players', label: 'Maks. graczy', type: 'number' },
  { key: 'gamemode', label: 'Tryb gry', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'] },
  { key: 'difficulty', label: 'Trudność', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'] },
  { key: 'online-mode', label: 'Online-mode (konta premium)', type: 'bool' },
  { key: 'pvp', label: 'PvP', type: 'bool' },
  { key: 'white-list', label: 'Whitelist', type: 'bool' },
  { key: 'view-distance', label: 'Zasięg widzenia', type: 'number' }
];

export function ServerPropsModal({ server, onClose }: { server: ServerInstance; onClose: () => void }) {
  const [props, setProps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const backdrop = useBackdropClose(onClose);

  useEffect(() => {
    window.api.servers.getProps(server.id).then(setProps);
  }, [server.id]);

  const set = (k: string, v: string) => setProps((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setBusy(true);
    const patch: Record<string, string> = {};
    for (const f of FIELDS) if (props[f.key] !== undefined) patch[f.key] = props[f.key];
    await window.api.servers.setProps(server.id, patch);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Ustawienia serwera — {server.name}</h3>
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>
              server.properties · zmiany działają po restarcie serwera
            </div>
          </div>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="edit-scroll">
          {FIELDS.map((f) => (
            <div className="form-row" key={f.key}>
              <label>{f.label}</label>
              {f.type === 'bool' ? (
                <select value={props[f.key] ?? 'false'} onChange={(e) => set(f.key, e.target.value)}>
                  <option value="true">Tak</option>
                  <option value="false">Nie</option>
                </select>
              ) : f.type === 'select' ? (
                <select value={props[f.key] ?? f.options![0]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options!.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={props[f.key] ?? ''}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="form-actions">
          <button onClick={onClose} disabled={busy}>
            Zamknij
          </button>
          <button className="primary" onClick={save} disabled={busy}>
            {saved ? 'Zapisano ✓' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
