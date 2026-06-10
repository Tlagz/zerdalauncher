import { create } from 'zustand';
import type {
  Account,
  Instance,
  AppSettings,
  DownloadProgress,
  LaunchStatus,
  UpdateStatus,
  ServerInstance,
  ServerStatus
} from '../shared/types';

interface UiState {
  page: 'instances' | 'servers' | 'accounts' | 'settings';
  setPage: (p: UiState['page']) => void;

  instances: Instance[];
  accounts: Account[];
  settings: AppSettings | null;
  activeAccountId: string | null;

  launchProgress: DownloadProgress | null;
  launchStatus: LaunchStatus | null;

  /** Game console output per instance id (capped buffer). */
  logs: Record<string, string>;
  clearLogs: (instanceId: string) => void;

  /** Servers + their per-server console output and status. */
  servers: ServerInstance[];
  serverLogs: Record<string, string>;
  serverStatus: Record<string, ServerStatus>;
  refreshServers: () => Promise<void>;
  clearServerLog: (id: string) => void;

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

  servers: [],
  serverLogs: {},
  serverStatus: {},
  refreshServers: async () => set({ servers: await window.api.servers.list() }),
  clearServerLog: (id) => set((s) => ({ serverLogs: { ...s.serverLogs, [id]: '' } })),

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
window.api.servers.onLog(({ id, line }) =>
  useStore.setState((s) => {
    const next = ((s.serverLogs[id] ?? '') + line).slice(-LOG_CAP);
    return { serverLogs: { ...s.serverLogs, [id]: next } };
  })
);
window.api.servers.onStatus((st) =>
  useStore.setState((s) => ({ serverStatus: { ...s.serverStatus, [st.id]: st } }))
);
