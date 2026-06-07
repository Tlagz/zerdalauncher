import { useStore } from '../store';

export function StatusBar() {
  const { launchProgress, launchStatus } = useStore();

  if (!launchStatus || launchStatus.state === 'stopped') return null;
  const pct =
    launchProgress && launchProgress.total > 0
      ? Math.round((launchProgress.current / launchProgress.total) * 100)
      : 0;

  const stateLabel: Record<string, string> = {
    preparing: 'Przygotowanie',
    downloading: 'Pobieranie',
    launching: 'Uruchamianie',
    running: 'Gra uruchomiona',
    error: 'Błąd'
  };

  return (
    <div className="status-bar">
      <strong>{stateLabel[launchStatus.state]}</strong>
      {launchProgress && (
        <>
          <span>
            {launchProgress.phase} {pct ? `(${pct}%)` : ''}
          </span>
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {launchStatus.message && <span style={{ color: launchStatus.state === 'error' ? 'var(--danger)' : undefined }}>{launchStatus.message}</span>}
    </div>
  );
}
