import { Loader2, CircleCheck, CircleAlert } from 'lucide-react';
import { useStore } from '../store';

const STATE_LABEL: Record<string, string> = {
  preparing: 'Przygotowanie',
  downloading: 'Pobieranie',
  launching: 'Uruchamianie',
  running: 'Gra uruchomiona',
  error: 'Błąd'
};

export function StatusBar() {
  const { launchProgress, launchStatus } = useStore();

  if (!launchStatus || launchStatus.state === 'stopped') return null;
  const pct =
    launchProgress && launchProgress.total > 0
      ? Math.round((launchProgress.current / launchProgress.total) * 100)
      : 0;
  const isError = launchStatus.state === 'error';
  const Icon = isError ? CircleAlert : launchStatus.state === 'running' ? CircleCheck : Loader2;

  return (
    <div className={`status-bar ${isError ? 'is-error' : ''}`}>
      <Icon size={16} className={`status-icon ${Icon === Loader2 ? 'spin' : ''}`} />
      <strong>{STATE_LABEL[launchStatus.state]}</strong>
      {launchProgress && !isError && launchStatus.state !== 'running' && (
        <>
          <span className="text-dim">
            {launchProgress.phase} {pct ? `(${pct}%)` : ''}
          </span>
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      {launchStatus.message && <span className="status-msg">{launchStatus.message}</span>}
    </div>
  );
}
