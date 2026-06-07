import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  Instance,
  Account,
  AppSettings,
  ModLoader,
  DownloadProgress,
  LaunchStatus,
  ModProvider,
  ModSearchResult,
  ModFile,
  InstalledMod,
  ContentKind,
  ContentUpdate,
  UpdateStatus
} from '../shared/types';

const api = {
  instances: {
    list: (): Promise<Instance[]> => ipcRenderer.invoke(IPC.instancesList),
    create: (opts: {
      name: string;
      mcVersion: string;
      loader: ModLoader;
      loaderVersion?: string;
      ramMb?: number;
      jvmArgs?: string;
      javaPath?: string;
    }): Promise<Instance> => ipcRenderer.invoke(IPC.instancesCreate, opts),
    update: (id: string, patch: Partial<Instance>): Promise<Instance | null> =>
      ipcRenderer.invoke(IPC.instancesUpdate, id, patch),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.instancesDelete, id),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.instancesOpenFolder, id),
    openCrashReports: (id: string): Promise<string> =>
      ipcRenderer.invoke(IPC.instancesOpenCrashReports, id),
    pickIcon: (): Promise<string | null> => ipcRenderer.invoke(IPC.instancesPickIcon)
  },
  mc: {
    versions: (): Promise<{
      latest: { release: string; snapshot: string };
      versions: Array<{ id: string; type: string; releaseTime: string }>;
    }> => ipcRenderer.invoke(IPC.mcVersions),
    launch: (id: string): Promise<void> => ipcRenderer.invoke(IPC.mcLaunch, id),
    onProgress: (cb: (p: DownloadProgress) => void): (() => void) => {
      const fn = (_: unknown, p: DownloadProgress) => cb(p);
      ipcRenderer.on(IPC.mcLaunchProgress, fn);
      return () => {
        ipcRenderer.off(IPC.mcLaunchProgress, fn);
      };
    },
    onStatus: (cb: (s: LaunchStatus) => void): (() => void) => {
      const fn = (_: unknown, s: LaunchStatus) => cb(s);
      ipcRenderer.on(IPC.mcLaunchStatus, fn);
      return () => {
        ipcRenderer.off(IPC.mcLaunchStatus, fn);
      };
    },
    onLog: (cb: (l: { instanceId: string; line: string }) => void): (() => void) => {
      const fn = (_: unknown, l: { instanceId: string; line: string }) => cb(l);
      ipcRenderer.on(IPC.mcLog, fn);
      return () => {
        ipcRenderer.off(IPC.mcLog, fn);
      };
    }
  },
  loaders: {
    fabricVersions: (mc: string): Promise<string[]> => ipcRenderer.invoke(IPC.fabricVersions, mc),
    forgeVersions: (mc: string): Promise<{ latest?: string; recommended?: string }> =>
      ipcRenderer.invoke(IPC.forgeVersions, mc),
    neoforgeVersions: (mc: string): Promise<{ latest?: string; versions: string[] }> =>
      ipcRenderer.invoke(IPC.neoforgeVersions, mc)
  },
  mods: {
    search: (
      kind: ContentKind,
      provider: ModProvider,
      query: string,
      mc: string,
      loader: string,
      offset = 0,
      category = ''
    ): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke(IPC.modsSearch, kind, provider, query, mc, loader, offset, category),
    files: (
      kind: ContentKind,
      provider: ModProvider,
      projectId: string,
      mc: string,
      loader: string
    ): Promise<ModFile[]> => ipcRenderer.invoke(IPC.modsFiles, kind, provider, projectId, mc, loader),
    install: (
      instanceId: string,
      kind: ContentKind,
      file: ModFile,
      withDeps = true
    ): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsInstall, instanceId, kind, file, withDeps),
    installed: (instanceId: string, kind: ContentKind): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsInstalled, instanceId, kind),
    toggle: (
      instanceId: string,
      kind: ContentKind,
      fileName: string,
      enabled: boolean
    ): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsToggle, instanceId, kind, fileName, enabled),
    delete: (instanceId: string, kind: ContentKind, fileName: string): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsDelete, instanceId, kind, fileName),
    addLocal: (instanceId: string, kind: ContentKind, filePaths: string[]): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsAddLocal, instanceId, kind, filePaths),
    checkUpdates: (instanceId: string, kind: ContentKind): Promise<ContentUpdate[]> =>
      ipcRenderer.invoke(IPC.modsCheckUpdates, instanceId, kind),
    update: (
      instanceId: string,
      kind: ContentKind,
      fileName: string,
      newFile: ModFile
    ): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsUpdate, instanceId, kind, fileName, newFile)
  },
  modpacks: {
    search: (
      provider: ModProvider,
      query: string,
      mc: string,
      offset = 0
    ): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke(IPC.modpacksSearch, provider, query, mc, offset),
    install: (provider: ModProvider, projectId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.modpacksInstall, provider, projectId),
    versions: (provider: ModProvider, projectId: string): Promise<ModFile[]> =>
      ipcRenderer.invoke(IPC.modpacksVersions, provider, projectId),
    installFile: (provider: ModProvider, projectId: string, fileId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.modpacksInstallFile, provider, projectId, fileId),
    import: (): Promise<string | null> => ipcRenderer.invoke(IPC.packImport),
    export: (instanceId: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.packExport, instanceId),
    onProgress: (cb: (p: { current: number; total: number; message: string }) => void): (() => void) => {
      const fn = (_: unknown, p: { current: number; total: number; message: string }) => cb(p);
      ipcRenderer.on(IPC.packProgress, fn);
      return () => {
        ipcRenderer.off(IPC.packProgress, fn);
      };
    },
    onImported: (
      cb: (r: { ok: boolean; id?: string; name?: string; error?: string }) => void
    ): (() => void) => {
      const fn = (_: unknown, r: { ok: boolean; id?: string; name?: string; error?: string }) => cb(r);
      ipcRenderer.on(IPC.packImported, fn);
      return () => {
        ipcRenderer.off(IPC.packImported, fn);
      };
    }
  },
  accounts: {
    list: (): Promise<Account[]> => ipcRenderer.invoke(IPC.accountsList),
    active: (): Promise<string | null> => ipcRenderer.invoke(IPC.accountsActive),
    selectActive: (id: string): Promise<void> => ipcRenderer.invoke(IPC.accountsSelectActive, id),
    msLogin: (): Promise<Account> => ipcRenderer.invoke(IPC.accountsMicrosoftLogin),
    offlineLogin: (username: string): Promise<Account> =>
      ipcRenderer.invoke(IPC.accountsOfflineLogin, username),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.accountsRemove, id),
    skin: (id: string): Promise<string | null> => ipcRenderer.invoke(IPC.accountsSkin, id)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  system: {
    detectJava: (): Promise<string | null> => ipcRenderer.invoke(IPC.systemDetectJava),
    appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appVersion)
  },
  updates: {
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.updateCheck),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.updateInstall),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const fn = (_: unknown, s: UpdateStatus) => cb(s);
      ipcRenderer.on(IPC.updateStatus, fn);
      return () => {
        ipcRenderer.off(IPC.updateStatus, fn);
      };
    }
  }
};

contextBridge.exposeInMainWorld('api', api);

export type LauncherApi = typeof api;
