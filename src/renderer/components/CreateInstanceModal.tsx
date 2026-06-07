import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import type { ModLoader } from '../../shared/types';

interface Props {
  onClose: () => void;
}

export function CreateInstanceModal({ onClose }: Props) {
  const { refreshInstances, settings } = useStore();
  const [versions, setVersions] = useState<Array<{ id: string; type: string }>>([]);
  const [latest, setLatest] = useState<{ release: string; snapshot: string } | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [name, setName] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<ModLoader>('vanilla');
  const [loaderVersions, setLoaderVersions] = useState<string[]>([]);
  const [loaderVersion, setLoaderVersion] = useState('');
  const [forgeInfo, setForgeInfo] = useState<{ latest?: string; recommended?: string }>({});
  const [neoVersions, setNeoVersions] = useState<string[]>([]);
  const [ramMb, setRamMb] = useState(settings?.defaultRamMb ?? 2048);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.mc.versions().then((m) => {
      setVersions(m.versions);
      setLatest(m.latest);
      setMcVersion(m.latest.release);
    });
  }, []);

  // Refresh loader versions when MC version / loader changes
  useEffect(() => {
    if (!mcVersion) return;
    setLoaderVersion('');
    if (loader === 'fabric') {
      window.api.loaders
        .fabricVersions(mcVersion)
        .then((v) => {
          setLoaderVersions(v);
          setLoaderVersion(v[0] ?? '');
        })
        .catch(() => setLoaderVersions([]));
    } else if (loader === 'forge') {
      window.api.loaders
        .forgeVersions(mcVersion)
        .then((info) => {
          setForgeInfo(info);
          setLoaderVersion(info.recommended ?? info.latest ?? '');
        })
        .catch(() => setForgeInfo({}));
    } else if (loader === 'neoforge') {
      window.api.loaders
        .neoforgeVersions(mcVersion)
        .then((info) => {
          setNeoVersions(info.versions);
          setLoaderVersion(info.latest ?? '');
        })
        .catch(() => setNeoVersions([]));
    }
  }, [loader, mcVersion]);

  const filteredVersions = useMemo(
    () => versions.filter((v) => showSnapshots || v.type === 'release'),
    [versions, showSnapshots]
  );

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      await window.api.instances.create({
        name: name || `${mcVersion} ${loader}`,
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion || undefined,
        ramMb
      });
      await refreshInstances();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Nowa instancja</h3>

        {error && <div className="error">{error}</div>}

        <div className="form-row">
          <label>Nazwa</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${mcVersion || 'Minecraft'} ${loader}`}
            autoFocus
          />
        </div>

        <div className="form-row">
          <label>Wersja Minecraft {latest && `(najnowsza: ${latest.release})`}</label>
          <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
            {filteredVersions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} ({v.type})
              </option>
            ))}
          </select>
          <label style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', textTransform: 'none' }}>
            <input
              type="checkbox"
              checked={showSnapshots}
              onChange={(e) => setShowSnapshots(e.target.checked)}
              style={{ width: 'auto' }}
            />
            Pokaż snapshoty
          </label>
        </div>

        <div className="form-row">
          <label>Mod loader</label>
          <div className="loader-select">
            {([
              { id: 'vanilla', label: 'Vanilla', icon: '🧱' },
              { id: 'fabric', label: 'Fabric', icon: '🧵' },
              { id: 'forge', label: 'Forge', icon: '⚙️' },
              { id: 'neoforge', label: 'NeoForge', icon: '🔥' }
            ] as Array<{ id: ModLoader; label: string; icon: string }>).map((l) => (
              <button
                type="button"
                key={l.id}
                className={`loader-chip ${l.id} ${loader === l.id ? 'active' : ''}`}
                onClick={() => setLoader(l.id)}
              >
                <span className="loader-chip-icon">{l.icon}</span>
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {loader === 'fabric' && (
          <div className="form-row">
            <label>Wersja Fabric Loader</label>
            <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
              {loaderVersions.length === 0 && <option>Ładowanie…</option>}
              {loaderVersions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}

        {loader === 'forge' && (
          <div className="form-row">
            <label>Wersja Forge</label>
            <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
              {forgeInfo.recommended && (
                <option value={forgeInfo.recommended}>{forgeInfo.recommended} (zalecana)</option>
              )}
              {forgeInfo.latest && forgeInfo.latest !== forgeInfo.recommended && (
                <option value={forgeInfo.latest}>{forgeInfo.latest} (najnowsza)</option>
              )}
              {!forgeInfo.recommended && !forgeInfo.latest && <option>Brak danych dla tej wersji</option>}
            </select>
          </div>
        )}

        {loader === 'neoforge' && (
          <div className="form-row">
            <label>Wersja NeoForge</label>
            <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
              {neoVersions.length === 0 && <option value="">Brak wersji dla tego MC (NeoForge: 1.20.2+)</option>}
              {neoVersions.map((v, i) => (
                <option key={v} value={v}>
                  {v} {i === 0 ? '(najnowsza)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-row">
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

        <div className="form-actions">
          <button onClick={onClose} disabled={busy}>
            Anuluj
          </button>
          <button className="primary" onClick={handleCreate} disabled={busy || !mcVersion}>
            {busy ? 'Tworzenie…' : 'Stwórz'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
