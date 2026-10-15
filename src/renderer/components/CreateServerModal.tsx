import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { useStore } from '../store';
import { useBackdropClose } from '../hooks/useBackdropClose';
import { LoaderIcon } from './InstanceIcon';
import type { ServerLoader } from '../../shared/types';

export function CreateServerModal({ onClose }: { onClose: () => void }) {
  const { refreshServers } = useStore();
  const [versions, setVersions] = useState<Array<{ id: string; type: string }>>([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [name, setName] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<ServerLoader>('fabric');
  const [ramMb, setRamMb] = useState(2048);
  const [port, setPort] = useState(25565);
  const [eula, setEula] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number; message: string } | null>(null);
  const backdrop = useBackdropClose(() => {
    if (!busy) onClose();
  });

  useEffect(() => {
    window.api.mc.versions().then((m) => {
      setVersions(m.versions);
      setMcVersion(m.latest.release);
    });
  }, []);
  useEffect(() => window.api.servers.onProgress((p) => setProgress(p)), []);

  const filtered = versions.filter((v) => showSnapshots || v.type === 'release');

  const create = async () => {
    setBusy(true);
    setError(null);
    setProgress({ current: 0, total: 1, message: 'Tworzę serwer…' });
    try {
      await window.api.servers.create({ name, mcVersion, loader, ramMb, port });
      await refreshServers();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nowy serwer</h3>
        {error && <div className="error">{error}</div>}

        {busy && progress && (
          <div className="pack-progress">
            <div className="pack-progress-msg">{progress.message}</div>
            <div className="pack-progress-bar">
              <div
                className="pack-progress-fill"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 30}%` }}
              />
            </div>
          </div>
        )}

        <div className="form-row">
          <label>Nazwa</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${mcVersion || 'Serwer'} ${loader}`}
            autoFocus
          />
        </div>

        <div className="form-row">
          <label>Wersja Minecraft</label>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {filtered.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} ({v.type})
              </option>
            ))}
          </select>
          <label className="check-row field-check">
            <input
              type="checkbox"
              checked={showSnapshots}
              onChange={(e) => setShowSnapshots(e.target.checked)}
            />
            Pokaż snapshoty
          </label>
        </div>

        <div className="form-row">
          <label>Typ serwera</label>
          <div className="loader-select two-col">
            {(
              [
                { id: 'vanilla', label: 'Vanilla' },
                { id: 'fabric', label: 'Fabric (mody)' },
                { id: 'forge', label: 'Forge (mody)' },
                { id: 'neoforge', label: 'NeoForge (mody)' }
              ] as const
            ).map((l) => (
              <button
                type="button"
                key={l.id}
                className={`loader-chip ${l.id} ${loader === l.id ? 'active' : ''}`}
                onClick={() => setLoader(l.id)}
              >
                <span className="loader-chip-icon">
                  <LoaderIcon loader={l.id} />
                </span>
                {l.label}
              </button>
            ))}
          </div>
          {(loader === 'forge' || loader === 'neoforge') && (
            <div className="field-hint">
              {loader === 'forge' ? 'Forge' : 'NeoForge'} uruchamia instalator i pobiera biblioteki —
              pierwsze tworzenie może potrwać 1–2 minuty.
            </div>
          )}
        </div>

        <div className="field-grid">
          <div>
            <label>RAM (MB): {ramMb}</label>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={ramMb}
              onChange={(e) => setRamMb(Number(e.target.value))}
            />
          </div>
          <div>
            <label>Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 25565)}
            />
          </div>
        </div>

        <label className="check-row eula-row">
          <input type="checkbox" checked={eula} onChange={(e) => setEula(e.target.checked)} />
          <span>
            Akceptuję <b>EULA Minecrafta</b> (account.mojang.com/documents/minecraft_eula). Wymagane do
            uruchomienia serwera.
          </span>
        </label>

        <div className="form-actions">
          <button onClick={onClose} disabled={busy}>
            Anuluj
          </button>
          <button className="primary" onClick={create} disabled={busy || !mcVersion || !eula}>
            {busy && <Loader2 size={16} className="spin" />}
            {busy ? 'Tworzę…' : 'Stwórz serwer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
