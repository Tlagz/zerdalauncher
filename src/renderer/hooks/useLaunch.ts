import { useState } from 'react';
import { useStore } from '../store';
import { alertDialog } from '../ui/feedback';
import type { Instance } from '../../shared/types';

/** Shared launch state/handler so the card and the detail view stay in sync. */
export function useLaunch(instance: Instance) {
  const { refreshInstances, launchStatus } = useStore();
  const [busy, setBusy] = useState(false);

  const isLaunching =
    busy ||
    (launchStatus?.instanceId === instance.id &&
      ['preparing', 'downloading', 'launching'].includes(launchStatus.state));

  const launch = async () => {
    setBusy(true);
    try {
      await window.api.mc.launch(instance.id);
      await refreshInstances();
    } catch (e) {
      alertDialog({ title: 'Nie udało się uruchomić', message: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return { isLaunching, launch };
}
