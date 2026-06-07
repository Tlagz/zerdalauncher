import { useStore } from '../store';

/** Floating banner shown when a launcher update has finished downloading. */
export function UpdateBanner() {
  const { updateStatus, updateDismissed, dismissUpdate } = useStore();
  if (!updateStatus || updateStatus.state !== 'ready' || updateDismissed) return null;

  return (
    <div className="update-banner">
      <span className="update-banner-text">
        🎉 Nowa wersja <strong>{updateStatus.version}</strong> jest gotowa do zainstalowania.
      </span>
      <div className="update-banner-actions">
        <button className="primary" onClick={() => window.api.updates.install()}>
          Uruchom ponownie i zaktualizuj
        </button>
        <button className="ghost" onClick={dismissUpdate}>
          Później
        </button>
      </div>
    </div>
  );
}
