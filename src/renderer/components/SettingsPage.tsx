import { useEffect, useState } from 'react';
import {
  Save,
  Check,
  Coffee,
  MemoryStick,
  ToggleRight,
  RefreshCw,
  Download,
  Trash2,
  Loader2,
  HardDrive,
  FolderInput,
  FolderOpen,
  RotateCcw,
  TriangleAlert
} from 'lucide-react';
import { useStore } from '../store';
import { alertDialog, confirmDialog } from '../ui/feedback';
import { formatSize } from '../format';
import { updateLabel } from '../updateLabel';
import { Segmented } from '../ui/Segmented';
import type { AppSettings, DataLocationInfo, JreStatus } from '../../shared/types';


export function SettingsPage() {
  const { settings, refreshSettings, updateStatus } = useStore();
  const [local, setLocal] = useState<AppSettings | null>(settings);
  const [detectedJava, setDetectedJava] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runtimes, setRuntimes] = useState<JreStatus[]>([]);
  const [dataLoc, setDataLoc] = useState<DataLocationInfo | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState<{ done: number; total: number; message: string } | null>(null);

  useEffect(() => {
    window.api.data.location().then(setDataLoc);
    return window.api.data.onProgress(setMoveProgress);
  }, []);

  /** Pick a folder (or the default), confirm, then move — the launcher restarts on success. */
  const relocate = async (useDefault: boolean) => {
    const pick = await window.api.data.pick(useDefault);
    if (!pick) return;
    const ok = await confirmDialog({
      title: 'Przenieść dane launchera?',
      message:
        `Instancje, biblioteki, assety, wersje gry i Javy (${formatSize(pick.bytes) || 'kilka MB'}) zostaną przeniesione do:
${pick.target}

` +
        'Po zakończeniu launcher uruchomi się ponownie.',
      confirmLabel: 'Przenieś'
    });
    if (!ok) return;
    setMoving(true);
    setMoveProgress(null);
    try {
      await window.api.data.move(pick.target);
    } catch (e) {
      setMoving(false);
      setMoveProgress(null);
      alertDialog({ title: 'Nie udało się przenieść danych', message: (e as Error).message, tone: 'error' });
    }
  };
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
          <div className="page-subtitle">Java, pamięć, dane i aktualizacje — wygląd zmienisz w Personalizacji</div>
        </div>
        <button className="primary" onClick={save} disabled={busy}>
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Zapisano' : 'Zapisz'}
        </button>
      </div>

      <div className="section">
        <h3>
          <Coffee size={16} /> Java
        </h3>
        <div className="field-grid single">
          <div>
            <label>Ścieżka do Javy (pozostaw puste, aby wykryć)</label>
            <input
              value={local.javaPath}
              onChange={(e) => setLocal({ ...local, javaPath: e.target.value })}
              placeholder={detectedJava ?? 'np. C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe'}
            />
            {detectedJava && (
              <div className="field-hint">
                Wykryto: <code>{detectedJava}</code>
              </div>
            )}
          </div>
        </div>

        <div className="settings-subblock">
          <label>Środowiska Java do pobrania (launcher i tak pobierze automatycznie przy starcie gry)</label>
          <div className="mod-list settings-list">
            {runtimes.map((r) => (
              <div className="mod-row" key={r.component}>
                <div className="mod-icon placeholder">
                  <Coffee size={22} />
                </div>
                <div className="mod-info">
                  <div className="mod-title">Java {r.javaMajor}</div>
                  <div className="mod-sub">
                    {r.mcRange}
                    {r.installed && (
                      <span className="ok-text">
                        {' · '}
                        <Check size={12} /> zainstalowana
                      </span>
                    )}
                    {runtimeBusy === r.component && runtimeProgress
                      ? ` · pobieram ${runtimeProgress.current}/${runtimeProgress.total}`
                      : ''}
                  </div>
                </div>
                {r.installed ? (
                  <button className="danger" disabled={runtimeBusy === r.component} onClick={() => deleteRuntime(r.component)}>
                    <Trash2 size={15} /> Usuń
                  </button>
                ) : (
                  <button className="primary" disabled={runtimeBusy === r.component} onClick={() => downloadRuntime(r.component)}>
                    {runtimeBusy === r.component ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
                    {runtimeBusy === r.component ? 'Pobieram…' : 'Pobierz'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="section">
        <h3>
          <MemoryStick size={16} /> Pamięć i wydajność
        </h3>
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
        <h3>
          <ToggleRight size={16} /> Zachowanie
        </h3>
        <label className="check-row">
          <input
            type="checkbox"
            checked={local.closeOnLaunch}
            onChange={(e) => setLocal({ ...local, closeOnLaunch: e.target.checked })}
          />
          Zamknij launcher po uruchomieniu gry
        </label>
        <div className="custom-field language-field">
          <label>Język / Language</label>
          <Segmented
            value={settings?.language ?? 'pl'}
            onChange={async (language) => {
              await window.api.settings.set({ language });
              // The translator is set up before the first render, so restart the window.
              location.reload();
            }}
            options={[
              { value: 'pl', label: 'Polski' },
              { value: 'en', label: 'English' }
            ]}
          />
        </div>
      </div>

      <div className="section">
        <h3>
          <HardDrive size={16} /> Lokalizacja danych
        </h3>
        {dataLoc?.unavailable && (
          <div className="notice notice-warning">
            <TriangleAlert size={16} />
            Nie znaleziono folderu {dataLoc.unavailable} (odłączony dysk?) — używam domyślnej lokalizacji.
          </div>
        )}
        <label>Instancje, biblioteki, assety, wersje gry i Javy</label>
        <code className="data-path">{dataLoc?.current ?? '…'}</code>
        <div className="data-actions">
          <button onClick={() => window.api.data.open()}>
            <FolderOpen size={15} /> Otwórz folder
          </button>
          <button className="primary" onClick={() => relocate(false)} disabled={moving}>
            <FolderInput size={15} /> Zmień lokalizację…
          </button>
          {dataLoc && !dataLoc.isDefault && (
            <button className="ghost" onClick={() => relocate(true)} disabled={moving}>
              <RotateCcw size={15} /> Przywróć domyślną
            </button>
          )}
        </div>
        {moving && (
          <div className="pack-progress">
            <div className="pack-progress-msg">
              {moveProgress ? `Przenoszę: ${moveProgress.message}` : 'Przenoszę dane…'}
            </div>
            <div className="pack-progress-bar">
              <div
                className="pack-progress-fill"
                style={{ width: `${moveProgress?.total ? (moveProgress.done / moveProgress.total) * 100 : 100}%` }}
              />
            </div>
            {moveProgress && (
              <div className="pack-progress-count">
                {formatSize(moveProgress.done)} / {formatSize(moveProgress.total)}
              </div>
            )}
          </div>
        )}
        <div className="field-hint">
          Konta, ustawienia i listy instancji zostają w {dataLoc?.defaultDir}. Na tym samym dysku przeniesienie jest
          natychmiastowe; na inny dysk pliki są kopiowane.
        </div>
      </div>

      <div className="section">
        <h3>
          <RefreshCw size={16} /> Aktualizacje
        </h3>
        <div className="update-row">
          <div>
            <div className="update-title">ZerdaLauncher {version && `v${version}`}</div>
            <div className="update-sub">
              {updateLabel(updateStatus) || 'Aktualizacje pobierają się automatycznie z GitHub.'}
            </div>
          </div>
          <div className="update-actions">
            {updateStatus?.state === 'ready' ? (
              <button className="primary" onClick={() => window.api.updates.install()}>
                <Download size={16} /> Uruchom ponownie i zainstaluj
              </button>
            ) : (
              <button onClick={() => window.api.updates.check()} disabled={checking}>
                <RefreshCw size={15} className={checking ? 'spin' : ''} />
                {checking ? 'Sprawdzam…' : 'Sprawdź aktualizacje'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
