import { create } from 'zustand';
import type {
  Account,
  Instance,
  AppSettings,
  DownloadProgress,
  LaunchStatus,
  UpdateStatus
} from '../shared/types';

interface UiState {
  page: 'instances' | 'accounts' | 'settings';
  setPage: (p: UiState['page']) => void;

  instances: Instance[];
  accounts: Account[];
  activeAccountId: string | null;
  settings: AppSettings | null;

  launchProgress: DownloadProgress | null;
  launchStatus: LaunchStatus | null;

  /** Game console output per instance id (capped buffer). */
  logs: Record<string, string>;
  clearLogs: (instanceId: string) => void;

  /** Launcher self-update status + dismissable banner flag. */
  updateStatus: UpdateStatus | null;
  updateDismissed: boolean;
  dismissUpdate: () => void;

  refreshInstances: () => Promise<void>;
  refreshAccounts: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

const LOG_CAP = 200_000; // chars kept per instance

export const useStore = create<UiState>((set) => ({
  page: 'instances',
  setPage: (page) => set({ page }),

  instances: [],
  accounts: [],
  activeAccountId: null,
  settings: null,
  launchProgress: null,
  launchStatus: null,
  logs: {},
  clearLogs: (instanceId) =>
    set((s) => ({ logs: { ...s.logs, [instanceId]: '' } })),

  updateStatus: null,
  updateDismissed: false,
  dismissUpdate: () => set({ updateDismissed: true }),

  refreshInstances: async () => set({ instances: await window.api.instances.list() }),
  refreshAccounts: async () =>
    set({
      accounts: await window.api.accounts.list(),
      activeAccountId: await window.api.accounts.active()
    }),
  refreshSettings: async () => set({ settings: await window.api.settings.get() })
}));

window.api.mc.onProgress((p) => useStore.setState({ launchProgress: p }));
window.api.mc.onStatus((s) => useStore.setState({ launchStatus: s }));
window.api.mc.onLog(({ instanceId, line }) =>
  useStore.setState((s) => {
    const next = ((s.logs[instanceId] ?? '') + line).slice(-LOG_CAP);
    return { logs: { ...s.logs, [instanceId]: next } };
  })
);
window.api.updates.onStatus((updateStatus) =>
  useStore.setState((s) => ({
    updateStatus,
    // re-show the banner when a new download becomes ready
    updateDismissed: updateStatus.state === 'ready' ? false : s.updateDismissed
  }))
);
