import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  Instance,
  Account,
  SkinEntry,
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
  UpdateStatus,
  WorldInfo,
  ServerInstance,
  ServerLoader,
  ServerStatus,
  TunnelStatus,
  JreStatus,
  LoaderVersionInfo,
  DataLocationInfo,
  CrashReport,
  CrashFix,
  ScreenshotInfo,
  ExportOptions,
  ScreenshotEntry,
  GameStats,
  MapInfo,
  MapTarget,
  CatalogPack,
  PublishRequest,
  PublisherStatus,
  McNewsEntry,
  McPatchNotes,
  PlaySession,
  SavedServer,
  ServerPing,
  ProjectDetails,
  ProjectChange,
  Invite,
  InviteCreated,
  InvitePreview
} from '../shared/types';
import type { PresetLook } from '../shared/appearance';

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
    duplicate: (id: string): Promise<Instance | null> =>
      ipcRenderer.invoke(IPC.instancesDuplicate, id),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.instancesOpenFolder, id),
    openCrashReports: (id: string): Promise<string> =>
      ipcRenderer.invoke(IPC.instancesOpenCrashReports, id),
    pickIcon: (): Promise<string | null> => ipcRenderer.invoke(IPC.instancesPickIcon)
  },
  screenshots: {
    list: (id: string): Promise<ScreenshotInfo[]> => ipcRenderer.invoke(IPC.screenshotsList, id),
    /** All instances' screenshots, newest first. */
    all: (): Promise<ScreenshotEntry[]> => ipcRenderer.invoke(IPC.screenshotsAll),
    copy: (id: string, name: string): Promise<void> => ipcRenderer.invoke(IPC.screenshotsCopy, id, name),
    /** Moves the file to the Recycle Bin. */
    delete: (id: string, name: string): Promise<ScreenshotInfo[]> =>
      ipcRenderer.invoke(IPC.screenshotsDelete, id, name),
    reveal: (id: string, name: string): Promise<void> => ipcRenderer.invoke(IPC.screenshotsReveal, id, name),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.screenshotsOpenFolder, id),
    /** URL served by the zerda-shot:// protocol. */
    url: (id: string, name: string, thumb = false): string =>
      `zerda-shot://shot/${encodeURIComponent(id)}/${encodeURIComponent(name)}${thumb ? '?thumb=1' : ''}`
  },
  servers: {
    list: (): Promise<ServerInstance[]> => ipcRenderer.invoke(IPC.serversList),
    create: (opts: {
      name: string;
      mcVersion: string;
      loader: ServerLoader;
      ramMb?: number;
      port?: number;
    }): Promise<ServerInstance> => ipcRenderer.invoke(IPC.serversCreate, opts),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversDelete, id),
    start: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversStart, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversStop, id),
    command: (id: string, cmd: string): Promise<void> =>
      ipcRenderer.invoke(IPC.serversCommand, id, cmd),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.serversOpenFolder, id),
    addMods: (id: string, filePaths: string[]): Promise<void> =>
      ipcRenderer.invoke(IPC.serversAddMods, id, filePaths),
    getProps: (id: string): Promise<Record<string, string>> =>
      ipcRenderer.invoke(IPC.serversGetProps, id),
    setProps: (id: string, patch: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke(IPC.serversSetProps, id, patch),
    onProgress: (cb: (p: { current: number; total: number; message: string }) => void): (() => void) => {
      const fn = (_: unknown, p: { current: number; total: number; message: string }) => cb(p);
      ipcRenderer.on(IPC.serversCreateProgress, fn);
      return () => {
        ipcRenderer.off(IPC.serversCreateProgress, fn);
      };
    },
    onLog: (cb: (l: { id: string; line: string }) => void): (() => void) => {
      const fn = (_: unknown, l: { id: string; line: string }) => cb(l);
      ipcRenderer.on(IPC.serversLog, fn);
      return () => {
        ipcRenderer.off(IPC.serversLog, fn);
      };
    },
    onStatus: (cb: (s: ServerStatus) => void): (() => void) => {
      const fn = (_: unknown, s: ServerStatus) => cb(s);
      ipcRenderer.on(IPC.serversStatus, fn);
      return () => {
        ipcRenderer.off(IPC.serversStatus, fn);
      };
    },
    startTunnel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversTunnelStart, id),
    stopTunnel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.serversTunnelStop, id),
    onTunnel: (cb: (s: TunnelStatus) => void): (() => void) => {
      const fn = (_: unknown, s: TunnelStatus) => cb(s);
      ipcRenderer.on(IPC.serversTunnelStatus, fn);
      return () => {
        ipcRenderer.off(IPC.serversTunnelStatus, fn);
      };
    }
  },
  worlds: {
    list: (id: string): Promise<WorldInfo[]> => ipcRenderer.invoke(IPC.worldsList, id),
    backup: (id: string, name: string): Promise<string> =>
      ipcRenderer.invoke(IPC.worldsBackup, id, name),
    restore: (id: string): Promise<WorldInfo[] | null> => ipcRenderer.invoke(IPC.worldsRestore, id),
    delete: (id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.worldsDelete, id, name),
    openFolder: (id: string): Promise<string> => ipcRenderer.invoke(IPC.worldsOpenFolder, id)
  },
  mc: {
    versions: (): Promise<{
      latest: { release: string; snapshot: string };
      versions: Array<{ id: string; type: string; releaseTime: string }>;
    }> => ipcRenderer.invoke(IPC.mcVersions),
    launch: (id: string, opts?: { world?: string; server?: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.mcLaunch, id, opts),
    kill: (id: string): Promise<void> => ipcRenderer.invoke(IPC.mcKill, id),
    runningList: (): Promise<string[]> => ipcRenderer.invoke(IPC.mcRunningList),
    onRunning: (cb: (ids: string[]) => void): (() => void) => {
      const fn = (_: unknown, ids: string[]) => cb(ids);
      ipcRenderer.on(IPC.mcRunning, fn);
      return () => {
        ipcRenderer.off(IPC.mcRunning, fn);
      };
    },
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
    },
    /** Memory/CPU of running games, every ~2 s (ended: true when a game closes). */
    onStats: (cb: (s: GameStats) => void): (() => void) => {
      const fn = (_: unknown, s: GameStats) => cb(s);
      ipcRenderer.on(IPC.mcStats, fn);
      return () => {
        ipcRenderer.off(IPC.mcStats, fn);
      };
    },
    /** "Graj" chosen in the tray menu. */
    onTrayLaunch: (cb: (instanceId: string) => void): (() => void) => {
      const fn = (_: unknown, id: string) => cb(id);
      ipcRenderer.on(IPC.trayLaunch, fn);
      return () => {
        ipcRenderer.off(IPC.trayLaunch, fn);
      };
    },
    /** Fired when a game session ends with a crash, with the diagnosis. */
    onCrash: (cb: (r: CrashReport) => void): (() => void) => {
      const fn = (_: unknown, r: CrashReport) => cb(r);
      ipcRenderer.on(IPC.mcCrash, fn);
      return () => {
        ipcRenderer.off(IPC.mcCrash, fn);
      };
    },
    /** Apply a suggested repair; resolves to a short summary. */
    crashFix: (id: string, fix: CrashFix): Promise<string> => ipcRenderer.invoke(IPC.mcCrashFix, id, fix),
    onCrashFixProgress: (
      cb: (p: { instanceId: string; current: number; total: number; message?: string }) => void
    ): (() => void) => {
      const fn = (_: unknown, p: { instanceId: string; current: number; total: number; message?: string }) => cb(p);
      ipcRenderer.on(IPC.mcCrashFixProgress, fn);
      return () => {
        ipcRenderer.off(IPC.mcCrashFixProgress, fn);
      };
    }
  },
  loaders: {
    fabricVersions: (mc: string): Promise<LoaderVersionInfo> => ipcRenderer.invoke(IPC.fabricVersions, mc),
    forgeVersions: (mc: string): Promise<LoaderVersionInfo> => ipcRenderer.invoke(IPC.forgeVersions, mc),
    neoforgeVersions: (mc: string): Promise<LoaderVersionInfo> =>
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
      category = '',
      sort = 'relevance'
    ): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke(IPC.modsSearch, kind, provider, query, mc, loader, offset, category, sort),
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
      withDeps = true,
      iconUrl?: string
    ): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsInstall, instanceId, kind, file, withDeps, iconUrl),
    installed: (instanceId: string, kind: ContentKind): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsInstalled, instanceId, kind),
    fetchIcons: (instanceId: string, kind: ContentKind): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modsFetchIcons, instanceId, kind),
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
    pickLocal: (instanceId: string, kind: ContentKind): Promise<InstalledMod[] | null> =>
      ipcRenderer.invoke(IPC.modsPickLocal, instanceId, kind),
    details: (provider: ModProvider, projectId: string): Promise<ProjectDetails> =>
      ipcRenderer.invoke(IPC.modsDetails, provider, projectId),
    /** Newest versions' changelogs for this MC version/loader (loader '' for packs and shaders). */
    changelog: (provider: ModProvider, projectId: string, mc: string, loader: string): Promise<ProjectChange[]> =>
      ipcRenderer.invoke(IPC.modsChangelog, provider, projectId, mc, loader),
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
      offset = 0,
      sort = 'relevance'
    ): Promise<ModSearchResult[]> =>
      ipcRenderer.invoke(IPC.modpacksSearch, provider, query, mc, offset, sort),
    install: (provider: ModProvider, projectId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.modpacksInstall, provider, projectId),
    versions: (provider: ModProvider, projectId: string): Promise<ModFile[]> =>
      ipcRenderer.invoke(IPC.modpacksVersions, provider, projectId),
    installFile: (provider: ModProvider, projectId: string, fileId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.modpacksInstallFile, provider, projectId, fileId),
    import: (): Promise<string | null> => ipcRenderer.invoke(IPC.packImport),
    export: (instanceId: string, opts: ExportOptions): Promise<string | null> =>
      ipcRenderer.invoke(IPC.packExport, instanceId, opts),
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
  skins: {
    list: (): Promise<SkinEntry[]> => ipcRenderer.invoke(IPC.skinsList),
    data: (id: string): Promise<string | null> => ipcRenderer.invoke(IPC.skinsData, id),
    add: (): Promise<{ added: number; skins: SkinEntry[] }> => ipcRenderer.invoke(IPC.skinsAdd),
    update: (
      id: string,
      patch: { name?: string; variant?: 'classic' | 'slim' }
    ): Promise<SkinEntry[]> => ipcRenderer.invoke(IPC.skinsUpdate, id, patch),
    delete: (id: string): Promise<SkinEntry[]> => ipcRenderer.invoke(IPC.skinsDelete, id),
    apply: (accountId: string, skinId: string): Promise<Account> =>
      ipcRenderer.invoke(IPC.skinsApply, accountId, skinId),
    reset: (accountId: string): Promise<Account> => ipcRenderer.invoke(IPC.skinsReset, accountId)
  },
  appearance: {
    /** Stored custom background as a data URL, or null. */
    background: (): Promise<string | null> => ipcRenderer.invoke(IPC.appearanceBackground),
    pickBackground: (): Promise<string | null> => ipcRenderer.invoke(IPC.appearancePickBackground),
    clearBackground: (): Promise<void> => ipcRenderer.invoke(IPC.appearanceClearBackground),
    /** UI sounds (data URLs) taken from the downloaded Minecraft assets. */
    sounds: (): Promise<Record<string, string>> => ipcRenderer.invoke(IPC.appearanceSounds),
    exportPreset: (preset: { name: string; theme: string; look: PresetLook }, withImage: boolean): Promise<string | null> =>
      ipcRenderer.invoke(IPC.appearanceExportPreset, preset, withImage),
    /** Reads a .zerdatheme; an embedded image is stored as the current background. */
    importPreset: (): Promise<{
      name: string;
      theme: string;
      look: Partial<PresetLook>;
      backgroundImage: string | null;
    } | null> => ipcRenderer.invoke(IPC.appearanceImportPreset),
    /** UI zoom (1 = 100%); applied to this window only, so it is set on every start. */
    setZoom: (factor: number): void => webFrame.setZoomFactor(factor)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  news: {
    minecraft: (): Promise<McNewsEntry[]> => ipcRenderer.invoke(IPC.newsMinecraft),
    patchNotes: (contentPath: string): Promise<McPatchNotes> => ipcRenderer.invoke(IPC.newsPatchNotes, contentPath)
  },
  invites: {
    create: (instanceId: string, address: string, name: string, from?: string): Promise<InviteCreated> =>
      ipcRenderer.invoke(IPC.invitesCreate, instanceId, address, name, from),
    /** An invite link currently in the clipboard, if any. */
    fromClipboard: (): Promise<{ invite: Invite; link: string } | null> => ipcRenderer.invoke(IPC.invitesFromClipboard),
    preview: (invite: Invite): Promise<InvitePreview> => ipcRenderer.invoke(IPC.invitesPreview, invite),
    /** Prepares the instance (creates it or updates mods); progress via modpacks.onProgress. */
    accept: (invite: Invite, instanceId: string | null): Promise<string> =>
      ipcRenderer.invoke(IPC.invitesAccept, invite, instanceId),
    /** A zerda://join link opened from outside (browser, double-click). */
    onOpened: (cb: (r: { invite: Invite; link: string }) => void): (() => void) => {
      const fn = (_: unknown, r: { invite: Invite; link: string }) => cb(r);
      ipcRenderer.on(IPC.invitesOpened, fn);
      return () => {
        ipcRenderer.off(IPC.invitesOpened, fn);
      };
    }
  },
  packs: {
    list: (fresh = false): Promise<CatalogPack[]> => ipcRenderer.invoke(IPC.packsList, fresh),
    /** Installs as a new instance; progress via modpacks.onProgress. */
    install: (packId: string): Promise<string> => ipcRenderer.invoke(IPC.packsInstall, packId),
    update: (instanceId: string): Promise<void> => ipcRenderer.invoke(IPC.packsUpdate, instanceId),
    status: (): Promise<PublisherStatus> => ipcRenderer.invoke(IPC.packsStatus),
    setToken: (token: string): Promise<PublisherStatus> => ipcRenderer.invoke(IPC.packsSetToken, token),
    forgetToken: (): Promise<void> => ipcRenderer.invoke(IPC.packsForgetToken),
    publish: (req: PublishRequest): Promise<CatalogPack> => ipcRenderer.invoke(IPC.packsPublish, req),
    delete: (packId: string): Promise<void> => ipcRenderer.invoke(IPC.packsDelete, packId)
  },
  map: {
    /** Open a world for the 2D map; tiles load from map.tileUrl(). */
    open: (target: MapTarget): Promise<MapInfo> => ipcRenderer.invoke(IPC.mapOpen, target),
    tileUrl: (token: string, dim: string, x: number, z: number, v: number): string =>
      `zerda-map://tile/${token}/${dim}/${x}/${z}.png?v=${v}`
  },
  stats: {
    playlog: (): Promise<PlaySession[]> => ipcRenderer.invoke(IPC.statsPlaylog)
  },
  savedServers: {
    list: (): Promise<SavedServer[]> => ipcRenderer.invoke(IPC.savedServersList),
    ping: (address: string): Promise<ServerPing> => ipcRenderer.invoke(IPC.savedServersPing, address)
  },
  system: {
    detectJava: (): Promise<string | null> => ipcRenderer.invoke(IPC.systemDetectJava),
    appVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appVersion)
  },
  data: {
    location: (): Promise<DataLocationInfo> => ipcRenderer.invoke(IPC.dataLocation),
    /** Folder picker (or the default location); returns the target and the size to move. */
    pick: (useDefault = false): Promise<{ target: string; bytes: number } | null> =>
      ipcRenderer.invoke(IPC.dataPick, useDefault),
    /** Moves the data and restarts the launcher on success. */
    move: (target: string): Promise<void> => ipcRenderer.invoke(IPC.dataMove, target),
    open: (): Promise<string> => ipcRenderer.invoke(IPC.dataOpen),
    onProgress: (cb: (p: { done: number; total: number; message: string }) => void): (() => void) => {
      const fn = (_: unknown, p: { done: number; total: number; message: string }) => cb(p);
      ipcRenderer.on(IPC.dataProgress, fn);
      return () => {
        ipcRenderer.off(IPC.dataProgress, fn);
      };
    }
  },
  java: {
    list: (): Promise<JreStatus[]> => ipcRenderer.invoke(IPC.javaList),
    download: (component: string): Promise<JreStatus[]> =>
      ipcRenderer.invoke(IPC.javaDownload, component),
    delete: (component: string): Promise<JreStatus[]> => ipcRenderer.invoke(IPC.javaDelete, component),
    onProgress: (
      cb: (p: { component: string; current: number; total: number; message?: string }) => void
    ): (() => void) => {
      const fn = (
        _: unknown,
        p: { component: string; current: number; total: number; message?: string }
      ) => cb(p);
      ipcRenderer.on(IPC.javaProgress, fn);
      return () => {
        ipcRenderer.off(IPC.javaProgress, fn);
      };
    }
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
