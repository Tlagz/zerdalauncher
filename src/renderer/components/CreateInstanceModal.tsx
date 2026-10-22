import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';
import { LoaderIcon } from './InstanceIcon';
import type { LoaderVersionInfo, ModLoader } from '../../shared/types';

interface Props {
  onClose: () => void;
  /** Preselect this Minecraft version (e.g. from the news on Home). */
  initialVersion?: string;
}

export function CreateInstanceModal({ onClose, initialVersion }: Props) {
  const { refreshInstances, settings, instances } = useStore();
  // Start from another instance's controls/graphics (and optionally its server list).
  const [settingsFrom, setSettingsFrom] = useState('');
  const [withServers, setWithServers] = useState(false);
  const [versions, setVersions] = useState<Array<{ id: string; type: string }>>([]);
  const [latest, setLatest] = useState<{ release: string; snapshot: string } | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [name, setName] = useState('');
  const [mcVersion, setMcVersion] = useState('');
  const [loader, setLoader] = useState<ModLoader>('vanilla');
  const [loaderInfo, setLoaderInfo] = useState<LoaderVersionInfo>({ stable: [], unstable: [] });
  const [loaderVersion, setLoaderVersion] = useState('');
  const [showUnstableLoader, setShowUnstableLoader] = useState(false);
  const [ramMb, setRamMb] = useState(settings?.defaultRamMb ?? 2048);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.mc.versions().then((m) => {
      setVersions(m.versions);
      setLatest(m.latest);
      const wanted = initialVersion && m.versions.find((v) => v.id === initialVersion);
      if (wanted && wanted.type !== 'release') setShowSnapshots(true);
      setMcVersion(wanted ? wanted.id : m.latest.release);
    });
  }, []);

  // Refresh loader versions when MC version / loader changes
  useEffect(() => {
    if (!mcVersion) return;
    setLoaderVersion('');
    setShowUnstableLoader(false);
    const fetchers: Record<string, ((mc: string) => Promise<LoaderVersionInfo>) | undefined> = {
      fabric: window.api.loaders.fabricVersions,
      forge: window.api.loaders.forgeVersions,
      neoforge: window.api.loaders.neoforgeVersions
    };
    const fetcher = fetchers[loader];
    if (!fetcher) return;
    fetcher(mcVersion)
      .then((info) => {
        setLoaderInfo(info);
        setLoaderVersion(info.recommended ?? info.latest ?? '');
      })
      .catch(() => setLoaderInfo({ stable: [], unstable: [] }));
  }, [loader, mcVersion]);

  const filteredVersions = useMemo(
    () => versions.filter((v) => showSnapshots || v.type === 'release'),
    [versions, showSnapshots]
  );

  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    try {
      const created = await window.api.instances.create({
        name: name || `${mcVersion} ${loader}`,
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion || undefined,
        ramMb
      });
      if (settingsFrom) await window.api.instances.copySettings(settingsFrom, created.id, withServers);
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
          <label>Mod loader</label>
          <div className="loader-select">
            {([
              { id: 'vanilla', label: 'Vanilla' },
              { id: 'fabric', label: 'Fabric' },
              { id: 'forge', label: 'Forge' },
              { id: 'neoforge', label: 'NeoForge' }
            ] as Array<{ id: ModLoader; label: string }>).map((l) => (
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
        </div>

        {loader !== 'vanilla' && (
          <div className="form-row">
            <label>Wersja {loader === 'fabric' ? 'Fabric Loader' : loader === 'forge' ? 'Forge' : 'NeoForge'}</label>
            <select value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)}>
              {loaderInfo.stable.length === 0 && loaderInfo.unstable.length === 0 && (
                <option>
                  {loader === 'neoforge' ? 'Brak wersji dla tego MC (NeoForge: 1.20.2+)' : 'Brak danych dla tej wersji'}
                </option>
              )}
              {loaderInfo.stable.map((v) => (
                <option key={v} value={v}>
                  {v}
                  {v === loaderInfo.recommended ? ' (zalecana)' : v === loaderInfo.latest ? ' (najnowsza)' : ''}
                </option>
              ))}
              {showUnstableLoader &&
                loaderInfo.unstable.map((v) => (
                  <option key={v} value={v}>
                    {v} (niestabilna)
                  </option>
                ))}
            </select>
            {loaderInfo.unstable.length > 0 && (
              <label className="check-row field-check">
                <input
                  type="checkbox"
                  checked={showUnstableLoader}
                  onChange={(e) => {
                    setShowUnstableLoader(e.target.checked);
                    if (!e.target.checked && !loaderInfo.stable.includes(loaderVersion)) {
                      setLoaderVersion(loaderInfo.recommended ?? loaderInfo.latest ?? loaderInfo.stable[0] ?? '');
                    }
                  }}
                />
                Pokaż niestabilne wersje ({loaderInfo.unstable.length})
              </label>
            )}
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

        {instances.length > 0 && (
          <div className="form-row">
            <label>Ustawienia gry (sterowanie, grafika)</label>
            <select value={settingsFrom} onChange={(e) => setSettingsFrom(e.target.value)}>
              <option value="">Domyślne Minecrafta</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  Skopiuj z: {i.name}
                </option>
              ))}
            </select>
            {settingsFrom && (
              <label className="check-row copy-servers">
                <input type="checkbox" checked={withServers} onChange={(e) => setWithServers(e.target.checked)} />
                Razem z listą serwerów
              </label>
            )}
          </div>
        )}

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
