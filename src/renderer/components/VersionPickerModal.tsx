import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBackdropClose } from '../hooks/useBackdropClose';
import type { ModFile } from '../../shared/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatSize(bytes?: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + ' MB' : (bytes / 1024).toFixed(0) + ' KB';
}

interface PackProgress {
  current: number;
  total: number;
  message: string;
}

/**
 * Generic "choose a version" dialog used for both mods and modpacks.
 * `load` returns the available files; `onInstall` performs the install of the
 * picked file. When `trackProgress` is set it shows the live modpack progress.
 */
export function VersionPickerModal({
  title,
  subtitle,
  note,
  load,
  onInstall,
  onClose,
  trackProgress = false
}: {
  title: string;
  subtitle?: string;
  note?: string;
  load: () => Promise<ModFile[]>;
  onInstall: (file: ModFile) => Promise<void>;
  onClose: () => void;
  trackProgress?: boolean;
}) {
  const [versions, setVersions] = useState<ModFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<PackProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((v) => !cancelled && setVersions(v))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!trackProgress) return;
    return window.api.modpacks.onProgress((p) => setProgress(p));
  }, [trackProgress]);

  const handle = async (file: ModFile) => {
    setBusyId(file.fileId);
    setError(null);
    setProgress(null);
    try {
      await onInstall(file);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setProgress(null);
    }
  };

  const pct = progress && progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const backdrop = useBackdropClose(() => {
    if (!busyId) onClose();
  });

  return createPortal(
    <div className="modal-backdrop" {...backdrop}>
      <div className="modal mod-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mod-modal-head">
          <div>
            <h3 style={{ margin: 0 }}>Wybierz wersję — {title}</h3>
            {subtitle && (
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>{subtitle}</div>
            )}
          </div>
          <button className="ghost" onClick={onClose} disabled={!!busyId}>
            ✕
          </button>
        </div>

        {note && <div className="picker-note">ℹ {note}</div>}
        {error && <div className="error">{error}</div>}

        {busyId && trackProgress && (
          <div className="pack-progress">
            <div className="pack-progress-msg">{progress?.message ?? 'Instaluję…'}</div>
            <div className="pack-progress-bar">
              <div className="pack-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="pack-progress-count">
              {progress ? `${progress.current} / ${progress.total}` : ''}
            </div>
          </div>
        )}

        <div className="mod-list">
          {loading && <div className="mod-empty">Wczytuję wersje…</div>}
          {!loading && versions.length === 0 && !error && (
            <div className="mod-empty">Brak dostępnych wersji.</div>
          )}
          {!loading &&
            versions.map((v) => (
              <div className="ver-row" key={v.fileId}>
                <div className="ver-info">
                  <div className="ver-title">
                    <span className={`rel-badge ${v.releaseType}`}>{v.releaseType}</span>
                    {v.displayName}
                  </div>
                  <div className="ver-sub">
                    {v.gameVersions.slice(0, 6).join(', ')}
                    {v.gameVersions.length > 6 ? '…' : ''}
                    {v.datePublished ? ` · ${formatDate(v.datePublished)}` : ''}
                    {v.size ? ` · ${formatSize(v.size)}` : ''}
                  </div>
                </div>
                <button className="primary" disabled={!!busyId} onClick={() => handle(v)}>
                  {busyId === v.fileId ? 'Instaluję…' : 'Instaluj'}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
