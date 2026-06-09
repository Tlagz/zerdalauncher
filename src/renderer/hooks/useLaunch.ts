import { useState } from 'react';
import { useStore } from '../store';
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
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { isLaunching, launch };
}
