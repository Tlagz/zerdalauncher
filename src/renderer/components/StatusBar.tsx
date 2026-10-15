import { Loader2, CircleCheck, CircleAlert, Square } from 'lucide-react';
import { useStore } from '../store';
import { confirmDialog } from '../ui/feedback';

const STATE_LABEL: Record<string, string> = {
  preparing: 'Przygotowanie',
  downloading: 'Pobieranie',
  launching: 'Uruchamianie',
  running: 'Gra uruchomiona',
  error: 'Błąd'
};

export function StatusBar() {
  const { launchProgress, launchStatus, runningGames, instances } = useStore();

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
      {launchStatus.message && launchStatus.message !== STATE_LABEL[launchStatus.state] && (
        <span className="status-msg">{launchStatus.message}</span>
      )}
      {launchStatus.state === 'running' && runningGames.includes(launchStatus.instanceId) && (
        <button
          className="danger btn-sm status-stop"
          onClick={async () => {
            const name = instances.find((i) => i.id === launchStatus.instanceId)?.name ?? 'gry';
            const ok = await confirmDialog({
              title: 'Zatrzymać grę?',
              message: `Proces „${name}" zostanie zabity. Niezapisany postęp w grze może przepaść.`,
              danger: true,
              confirmLabel: 'Zatrzymaj grę'
            });
            if (ok) await window.api.mc.kill(launchStatus.instanceId);
          }}
        >
          <Square size={12} fill="currentColor" /> Zatrzymaj
        </button>
      )}
    </div>
  );
}
