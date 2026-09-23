import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { alertDialog } from '../ui/feedback';
import type { AppSettings, JreStatus } from '../../shared/types';

function updateLabel(s: ReturnType<typeof useStore.getState>['updateStatus']): string {
  switch (s?.state) {
    case 'checking':
      return 'Sprawdzam dostępność aktualizacji…';
    case 'available':
      return `Znaleziono wersję ${s.version} — pobieram…`;
    case 'downloading':
      return `Pobieranie aktualizacji… ${s.percent}%`;
    case 'ready':
      return `Wersja ${s.version} gotowa do instalacji.`;
    case 'none':
      return 'Masz najnowszą wersję. ✓';
    case 'disabled':
      return 'Auto-aktualizacje działają tylko w zainstalowanej wersji (nie w trybie dev).';
    case 'error':
      return `Błąd sprawdzania aktualizacji: ${s.message}`;
    default:
      return '';
  }
}

export function SettingsPage() {
  const { settings, refreshSettings, updateStatus } = useStore();
  const [local, setLocal] = useState<AppSettings | null>(settings);
  const [detectedJava, setDetectedJava] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runtimes, setRuntimes] = useState<JreStatus[]>([]);
  const [runtimeBusy, setRuntimeBusy] = useState<string | null>(null);
  const [runtimeProgress, setRuntimeProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  const loadRuntimes = () => window.api.java.list().then(setRuntimes);

  useEffect(() => setLocal(settings), [settings]);
  useEffect(() => {
    window.api.system.detectJava().then(setDetectedJava);
    window.api.system.appVersion().then(setVersion);
    loadRuntimes();
    return window.api.java.onProgress((p) => {
      setRuntimeProgress({ current: p.current, total: p.total });
    });
  }, []);

  const downloadRuntime = async (component: string) => {
    setRuntimeBusy(component);
    setRuntimeProgress(null);
    try {
      setRuntimes(await window.api.java.download(component));
    } catch (e) {
      alertDialog({ title: 'Pobieranie Javy nie powiodło się', message: (e as Error).message, tone: 'error' });
    } finally {
      setRuntimeBusy(null);
      setRuntimeProgress(null);
    }
  };

  const deleteRuntime = async (component: string) => {
    setRuntimes(await window.api.java.delete(component));
  };

  if (!local) return null;

  const checking = updateStatus?.state === 'checking' || updateStatus?.state === 'downloading';

  const save = async () => {
    setBusy(true);
    await window.api.settings.set(local);
    await refreshSettings();
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Ustawienia</div>
          <div className="page-subtitle">Domyślne wartości dla nowych instancji</div>
        </div>
        <button className="primary" onClick={save} disabled={busy}>
          {saved ? 'Zapisano ✓' : 'Zapisz'}
        </button>
      </div>

      <div className="section">
        <h3>Motyw</h3>
        <div className="theme-grid">
          {[
            { id: 'default', label: 'Domyślny', desc: 'Fiolet + cyan' },
            { id: 'dark', label: 'Ciemny', desc: 'Czarny + stal' },
            { id: 'crimson', label: 'Crimson', desc: 'Czerwień + czerń' },
            { id: 'light', label: 'Jasny', desc: 'Dzienny' }
          ].map((t) => (
            <button
              type="button"
              key={t.id}
              className={`theme-card theme-${t.id} ${local.theme === t.id ? 'active' : ''}`}
              onClick={() => {
                setLocal({ ...local, theme: t.id });
                document.documentElement.dataset.theme = t.id;
              }}
            >
              <span className="theme-swatch" />
              <span className="theme-name">{t.label}</span>
              <span className="theme-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Java</h3>
        <div className="field-grid single">
          <div>
            <label>Ścieżka do Javy (pozostaw puste, aby wykryć)</label>
            <input
              value={local.javaPath}
              onChange={(e) => setLocal({ ...local, javaPath: e.target.value })}
              placeholder={detectedJava ?? 'np. C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe'}
            />
            {detectedJava && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 6 }}>
                Wykryto: <code>{detectedJava}</code>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <label>Środowiska Java do pobrania (launcher i tak pobierze automatycznie przy starcie gry)</label>
          <div className="mod-list" style={{ marginTop: 8 }}>
            {runtimes.map((r) => (
              <div className="mod-row" key={r.component}>
                <div className="mod-icon placeholder">☕</div>
                <div className="mod-info">
                  <div className="mod-title">Java {r.javaMajor}</div>
                  <div className="mod-sub">
                    {r.mcRange}
                    {r.installed ? ' · zainstalowana ✓' : ''}
                    {runtimeBusy === r.component && runtimeProgress
                      ? ` · pobieram ${runtimeProgress.current}/${runtimeProgress.total}`
                      : ''}
                  </div>
                </div>
                {r.installed ? (
                  <button className="danger" disabled={runtimeBusy === r.component} onClick={() => deleteRuntime(r.component)}>
                    🗑 Usuń
                  </button>
                ) : (
                  <button className="primary" disabled={runtimeBusy === r.component} onClick={() => downloadRuntime(r.component)}>
                    {runtimeBusy === r.component ? 'Pobieram…' : '⬇ Pobierz'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Pamięć i wydajność</h3>
        <div className="field-grid single">
          <div>
            <label>Domyślny RAM (MB): {local.defaultRamMb}</label>
            <input
              type="range"
              min={1024}
              max={16384}
              step={512}
              value={local.defaultRamMb}
              onChange={(e) => setLocal({ ...local, defaultRamMb: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <div className="section">
        <h3>Zachowanie</h3>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', textTransform: 'none' }}>
          <input
            type="checkbox"
            checked={local.closeOnLaunch}
            onChange={(e) => setLocal({ ...local, closeOnLaunch: e.target.checked })}
            style={{ width: 'auto' }}
          />
          Zamknij launcher po uruchomieniu gry
        </label>
      </div>

      <div className="section">
        <h3>Aktualizacje</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 600 }}>ZerdaLauncher {version && `v${version}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {updateLabel(updateStatus) || 'Aktualizacje pobierają się automatycznie z GitHub.'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {updateStatus?.state === 'ready' ? (
              <button className="primary" onClick={() => window.api.updates.install()}>
                Uruchom ponownie i zainstaluj
              </button>
            ) : (
              <button onClick={() => window.api.updates.check()} disabled={checking}>
                {checking ? 'Sprawdzam…' : 'Sprawdź aktualizacje'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
