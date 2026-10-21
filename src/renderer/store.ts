import { create } from 'zustand';
import { playSound } from './ui/sounds';
import { alertDialog } from './ui/feedback';
import { markInviteSeen } from './invites';
import type {
  Account,
  Instance,
  AppSettings,
  DownloadProgress,
  LaunchStatus,
  UpdateStatus,
  ServerInstance,
  ServerStatus,
  TunnelStatus,
  CrashReport,
  Invite,
  GameStats
} from '../shared/types';

/** Instances-page actions other places can trigger (e.g. the Ctrl+K palette). */
export type InstancesAction = 'create' | 'modpacks' | 'import';

interface UiState {
  page: 'home' | 'instances' | 'screenshots' | 'servers' | 'accounts' | 'customize' | 'settings';
  setPage: (p: UiState['page']) => void;

  instances: Instance[];
  accounts: Account[];
  settings: AppSettings | null;
  activeAccountId: string | null;
  /** Custom background image (data URL) from the Personalizacja page. */
  backgroundImage: string | null;

  launchProgress: DownloadProgress | null;
  launchStatus: LaunchStatus | null;
  /** Instance ids whose game process is currently running. */
  runningGames: string[];
  /** Live memory/CPU per running game, with the last minute of RAM samples. */
  gameStats: Record<string, GameStats & { ramHistory: number[] }>;

  /** Diagnosis of the last crashed game session (shown in a dialog). */
  crash: CrashReport | null;
  /** Instance whose detail view is open on the Instances page. */
  selectedInstanceId: string | null;
  /** Open an instance's detail view from anywhere. */
  openInstance: (id: string | null) => void;
  pendingAction: InstancesAction | null;
  paletteOpen: boolean;
  /** A server invite to show (opened via zerda:// or found in the clipboard). */
  invite: { invite: Invite; link: string } | null;

  /** Game console output per instance id (capped buffer). */
  logs: Record<string, string>;
  clearLogs: (instanceId: string) => void;

  /** Servers + their per-server console output and status. */
  servers: ServerInstance[];
  serverLogs: Record<string, string>;
  serverStatus: Record<string, ServerStatus>;
  tunnels: Record<string, TunnelStatus>;
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
  page: 'home',
  setPage: (page) => set({ page }),

  instances: [],
  accounts: [],
  activeAccountId: null,
  settings: null,
  backgroundImage: null,
  launchProgress: null,
  launchStatus: null,
  runningGames: [],
  gameStats: {},
  crash: null,
  selectedInstanceId: null,
  openInstance: (id) => set({ selectedInstanceId: id, ...(id ? { page: 'instances' as const } : {}) }),
  pendingAction: null,
  paletteOpen: false,
  invite: null,
  logs: {},
  clearLogs: (instanceId) =>
    set((s) => ({ logs: { ...s.logs, [instanceId]: '' } })),

  servers: [],
  serverLogs: {},
  serverStatus: {},
  tunnels: {},
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
window.api.mc.onStatus((s) => {
  if (s.state === 'running') playSound('launch');
  useStore.setState({ launchStatus: s });
});
window.api.mc.onRunning((ids) => useStore.setState({ runningGames: ids }));
window.api.mc.runningList().then((ids) => useStore.setState({ runningGames: ids }));
// A clicked zerda:// link always shows; afterwards the clipboard check skips it.
window.api.invites.onOpened((invite) => {
  markInviteSeen(invite.link);
  useStore.setState({ invite });
});
window.api.mc.onStats((st) =>
  useStore.setState((s) => {
    const next = { ...s.gameStats };
    if (st.ended) delete next[st.instanceId];
    else next[st.instanceId] = { ...st, ramHistory: [...(s.gameStats[st.instanceId]?.ramHistory ?? []), st.ram].slice(-30) };
    return { gameStats: next };
  })
);
window.api.mc.onTrayLaunch((id) =>
  window.api.mc.launch(id).then(
    () => useStore.getState().refreshInstances(),
    (e) => alertDialog({ title: 'Nie udało się uruchomić', message: (e as Error).message, tone: 'error' })
  )
);
window.api.mc.onCrash((crash) => {
  playSound('error');
  useStore.setState({ crash });
});
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
window.api.servers.onTunnel((t) =>
  useStore.setState((s) => ({ tunnels: { ...s.tunnels, [t.id]: t } }))
);
