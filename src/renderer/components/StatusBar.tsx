import { Loader2, CircleCheck, CircleAlert, Square, MemoryStick, Cpu } from 'lucide-react';
import { useStore } from '../store';
import { confirmDialog } from '../ui/feedback';
import type { GameStats } from '../../shared/types';

const STATE_LABEL: Record<string, string> = {
  preparing: 'Przygotowanie',
  downloading: 'Pobieranie',
  launching: 'Uruchamianie',
  running: 'Gra uruchomiona',
  error: 'Błąd'
};

/** RAM (of the allocated -Xmx) with a one-minute sparkline, and CPU share. */
function GameMeter({ stats }: { stats: GameStats & { ramHistory: number[] } }) {
  const maxBytes = stats.maxMb * 1024 * 1024;
  const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
  // Working set includes the JVM itself, so it can exceed -Xmx a little.
  const top = Math.max(maxBytes, ...stats.ramHistory) * 1.05;
  const pts = stats.ramHistory.map((v, i, a) => `${a.length > 1 ? (i / (a.length - 1)) * 60 : 60},${18 - (v / top) * 16}`).join(' ');
  const high = stats.ram > maxBytes * 0.9;
  return (
    <div className="game-meter" title="Pamięć używana przez proces gry (z JVM) / przydzielony RAM">
      <span className={`meter-item ${high ? 'warn' : ''}`}>
        <MemoryStick size={14} /> {gb(stats.ram)} / {gb(maxBytes)} GB
      </span>
      {stats.ramHistory.length > 1 && (
        <svg className="meter-spark" viewBox="0 0 60 20" width="60" height="20" aria-hidden>
          <polyline points={pts} fill="none" />
        </svg>
      )}
      <span className="meter-item">
        <Cpu size={14} /> {stats.cpu}%
      </span>
    </div>
  );
}

export function StatusBar() {
  const { launchProgress, launchStatus, runningGames, instances, gameStats } = useStore();

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
      {launchStatus.state === 'running' && gameStats[launchStatus.instanceId] && (
        <GameMeter stats={gameStats[launchStatus.instanceId]} />
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
