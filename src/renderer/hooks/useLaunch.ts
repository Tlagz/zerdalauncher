import { useState } from 'react';
import { useStore } from '../store';
import { alertDialog, confirmDialog } from '../ui/feedback';
import { ensurePackUpToDate } from '../packLaunch';
import type { Instance } from '../../shared/types';

/** Shared launch/stop state so the card, detail view and Home stay in sync. */
export function useLaunch(instance: Instance) {
  const { refreshInstances, launchStatus } = useStore();
  const isRunning = useStore((s) => s.runningGames.includes(instance.id));
  const [busy, setBusy] = useState(false);

  const isLaunching =
    !isRunning &&
    (busy ||
      (launchStatus?.instanceId === instance.id &&
        ['preparing', 'downloading', 'launching'].includes(launchStatus.state)));

  /** Optionally straight into a saved world, or onto a server. */
  const launch = async (world?: string, server?: string) => {
    setBusy(true);
    try {
      if (!(await ensurePackUpToDate(instance))) return;
      await window.api.mc.launch(instance.id, world || server ? { world, server } : undefined);
      await refreshInstances();
    } catch (e) {
      alertDialog({ title: 'Nie udało się uruchomić', message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    const ok = await confirmDialog({
      title: 'Zatrzymać grę?',
      message: `Proces „${instance.name}" zostanie zabity. Niezapisany postęp w grze może przepaść.`,
      danger: true,
      confirmLabel: 'Zatrzymaj grę'
    });
    if (ok) await window.api.mc.kill(instance.id);
  };

  return { isLaunching, isRunning, launch, stop };
}
