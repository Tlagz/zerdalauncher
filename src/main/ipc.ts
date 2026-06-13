import { ipcMain, shell, dialog, BrowserWindow, nativeImage, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { IPC } from '../shared/ipc-channels';
import { checkForUpdates, quitAndInstall, currentStatus } from './updater';
import { setPlaying, setIdle, reinitDiscord } from './discord';
import {
  listInstances,
  createInstance,
  updateInstance,
  deleteInstance,
  getInstance,
  duplicateInstance
} from './minecraft/instances';
import { fetchVersionManifest } from './minecraft/manifest';
import { prepareVersion } from './minecraft/downloader';
import { resolveJava } from './minecraft/jre';
import { launchGame } from './minecraft/launcher';
import { fabricLoaders, installFabric } from './modloaders/fabric';
import { forgeVersionsFor, installForge } from './modloaders/forge';
import { neoforgeVersionsFor, installNeoForge } from './modloaders/neoforge';
import {
  searchContent,
  searchModpacks,
  getContentFiles,
  installContent,
  listInstalledContent,
  toggleContent,
  deleteContent,
  addLocalContent,
  checkUpdates,
  updateContent
} from './mods';
import {
  installModpack,
  getModpackVersions,
  installModpackFile,
  importPackFile,
  exportInstance
} from './mods/modpacks';
import { microsoftLogin } from './auth/microsoft';
import {
  listAccounts,
  addAccount,
  removeAccount,
  selectActive,
  activeAccountId,
  createOfflineAccount,
  ensureFreshToken
} from './auth/accounts';
import { paths, instanceDir, instanceGameDir } from './utils/paths';
import { readJson, writeJson } from './utils/store';
import { fetchAsDataUrl } from './utils/http';
import { detectJava } from './utils/java';
import { listWorlds, backupWorld, restoreWorld, deleteWorld, savesFolder } from './minecraft/worlds';
import {
  initServers,
  listServers,
  getServer,
  createServer,
  deleteServer,
  startServer,
  stopServer,
  sendCommand,
  addLocalMods as addServerMods,
  getProps,
  setProps
} from './server';
import { initTunnel, startTunnel, stopTunnel } from './server/tunnel';
import { serverDir } from './utils/paths';
import type { AppSettings, Instance, ModLoader } from '../shared/types';
import type { LaunchStatus, DownloadProgress } from '../shared/types';

const DEFAULT_SETTINGS: AppSettings = {
  defaultRamMb: 2048,
  javaPath: '',
  closeOnLaunch: false,
  curseforgeApiKey: '',
  discordClientId: '',
  theme: 'default'
};

function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJson<Partial<AppSettings>>(paths.settings, {}) };
}

function emitToAll(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // Instances
  ipcMain.handle(IPC.instancesList, () => listInstances());
  ipcMain.handle(IPC.instancesCreate, (_e, opts) => createInstance(opts));
  ipcMain.handle(IPC.instancesUpdate, (_e, id, patch) => updateInstance(id, patch));
  ipcMain.handle(IPC.instancesDelete, (_e, id) => deleteInstance(id));
  ipcMain.handle(IPC.instancesDuplicate, (_e, id) => duplicateInstance(id));
  ipcMain.handle(IPC.instancesOpenFolder, (_e, id) => shell.openPath(instanceDir(id)));
  ipcMain.handle(IPC.instancesOpenCrashReports, (_e, id: string) => {
    const crashDir = path.join(instanceGameDir(id), 'crash-reports');
    return shell.openPath(fs.existsSync(crashDir) ? crashDir : instanceGameDir(id));
  });
  // Servers
  initServers(
    (id, line) => emitToAll(IPC.serversLog, { id, line }),
    (s) => emitToAll(IPC.serversStatus, s)
  );
  initTunnel((s) => emitToAll(IPC.serversTunnelStatus, s));
  const srvProgress = (current: number, total: number, message: string) =>
    emitToAll(IPC.serversCreateProgress, { current, total, message });
  ipcMain.handle(IPC.serversList, () => listServers());
  ipcMain.handle(IPC.serversCreate, (_e, opts) => createServer(opts, srvProgress));
  ipcMain.handle(IPC.serversDelete, (_e, id: string) => deleteServer(id));
  ipcMain.handle(IPC.serversStart, (_e, id: string) => startServer(id));
  ipcMain.handle(IPC.serversStop, (_e, id: string) => stopServer(id));
  ipcMain.handle(IPC.serversCommand, (_e, id: string, cmd: string) => sendCommand(id, cmd));
  ipcMain.handle(IPC.serversOpenFolder, (_e, id: string) => shell.openPath(serverDir(id)));
  ipcMain.handle(IPC.serversAddMods, (_e, id: string, paths: string[]) => addServerMods(id, paths));
  ipcMain.handle(IPC.serversGetProps, (_e, id: string) => getProps(id));
  ipcMain.handle(IPC.serversSetProps, (_e, id: string, patch) => setProps(id, patch));
  ipcMain.handle(IPC.serversTunnelStart, (_e, id: string) => {
    const srv = getServer(id);
    if (!srv) throw new Error('Brak serwera.');
    return startTunnel(id, srv.port);
  });
  ipcMain.handle(IPC.serversTunnelStop, (_e, id: string) => stopTunnel(id));

  // Worlds / backups
  ipcMain.handle(IPC.worldsList, (_e, id: string) => listWorlds(id));
  ipcMain.handle(IPC.worldsBackup, (_e, id: string, name: string) => backupWorld(id, name));
  ipcMain.handle(IPC.worldsDelete, (_e, id: string, name: string) => deleteWorld(id, name));
  ipcMain.handle(IPC.worldsOpenFolder, (_e, id: string) => shell.openPath(savesFolder(id)));
  ipcMain.handle(IPC.worldsRestore, async (_e, id: string) => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: 'Przywróć świat z kopii',
      properties: ['openFile'],
      filters: [{ name: 'Kopia świata', extensions: ['zip'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    restoreWorld(id, res.filePaths[0]);
    return listWorlds(id);
  });

  ipcMain.handle(IPC.instancesPickIcon, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: 'Wybierz ikonę instancji',
      properties: ['openFile'],
      filters: [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    if (fs.statSync(file).size > 12 * 1024 * 1024) {
      throw new Error('Plik jest za duży (max 12 MB). Wybierz mniejszy.');
    }
    // Auto-downscale to a small square so instances.json stays tiny.
    const img = nativeImage.createFromPath(file);
    if (img.isEmpty()) {
      throw new Error('Nie udało się wczytać obrazu (nieobsługiwany format?).');
    }
    const { width, height } = img.getSize();
    const MAX = 128;
    const resized =
      width > MAX || height > MAX
        ? img.resize(
            width >= height ? { width: MAX, quality: 'best' } : { height: MAX, quality: 'best' }
          )
        : img;
    // toDataURL() returns a compact PNG data URL (a few KB at 128px).
    return resized.toDataURL();
  });

  // Minecraft versions
  ipcMain.handle(IPC.mcVersions, async () => {
    const m = await fetchVersionManifest();
    return {
      latest: m.latest,
      versions: m.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
    };
  });

  // Modloaders
  ipcMain.handle(IPC.fabricVersions, (_e, mc: string) => fabricLoaders(mc));
  ipcMain.handle(IPC.forgeVersions, (_e, mc: string) => forgeVersionsFor(mc));
  ipcMain.handle(IPC.neoforgeVersions, (_e, mc: string) => neoforgeVersionsFor(mc));

  // Mods / content (mods, resourcepacks, shaders)
  ipcMain.handle(
    IPC.modsSearch,
    (_e, kind, provider, query: string, mc: string, loader: string, offset: number, category: string, sort: string) =>
      searchContent(kind, provider, query, mc, loader, offset, category, sort)
  );
  ipcMain.handle(IPC.modsFiles, (_e, kind, provider, projectId: string, mc: string, loader: string) =>
    getContentFiles(kind, provider, projectId, mc, loader)
  );
  ipcMain.handle(IPC.modsInstall, (_e, instanceId: string, kind, file, withDeps: boolean) =>
    installContent(instanceId, kind, file, withDeps)
  );
  ipcMain.handle(IPC.modsInstalled, (_e, instanceId: string, kind) =>
    listInstalledContent(instanceId, kind)
  );
  ipcMain.handle(IPC.modsToggle, (_e, instanceId: string, kind, fileName: string, enabled: boolean) =>
    toggleContent(instanceId, kind, fileName, enabled)
  );
  ipcMain.handle(IPC.modsDelete, (_e, instanceId: string, kind, fileName: string) =>
    deleteContent(instanceId, kind, fileName)
  );
  ipcMain.handle(IPC.modsAddLocal, (_e, instanceId: string, kind, filePaths: string[]) =>
    addLocalContent(instanceId, kind, filePaths)
  );
  ipcMain.handle(IPC.modsCheckUpdates, (_e, instanceId: string, kind) =>
    checkUpdates(instanceId, kind)
  );
  ipcMain.handle(IPC.modsUpdate, (_e, instanceId: string, kind, fileName: string, newFile) =>
    updateContent(instanceId, kind, fileName, newFile)
  );

  // Modpacks
  const packProgress = (current: number, total: number, message: string) =>
    emitToAll(IPC.packProgress, { current, total, message });

  ipcMain.handle(IPC.modpacksSearch, (_e, provider, query: string, mc: string, offset: number, sort: string) =>
    searchModpacks(provider, query, mc, offset, sort)
  );
  ipcMain.handle(IPC.modpacksInstall, (_e, provider, projectId: string) =>
    installModpack(provider, projectId, packProgress)
  );
  ipcMain.handle(IPC.modpacksVersions, (_e, provider, projectId: string) =>
    getModpackVersions(provider, projectId)
  );
  ipcMain.handle(IPC.modpacksInstallFile, (_e, provider, projectId: string, fileId: string) =>
    installModpackFile(provider, projectId, fileId, packProgress)
  );
  ipcMain.handle(IPC.packImport, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: 'Importuj paczkę',
      properties: ['openFile'],
      filters: [{ name: 'Paczki modów', extensions: ['mrpack', 'zerda', 'zip'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return importPackFile(res.filePaths[0], packProgress);
  });
  ipcMain.handle(IPC.packExport, async (_e, instanceId: string) => {
    const win = getMainWindow() ?? undefined;
    const instance = getInstance(instanceId);
    const suggested = (instance?.name ?? 'modpack').replace(/[^\w.-]+/g, '_');
    const res = await dialog.showSaveDialog(win!, {
      title: 'Eksportuj paczkę',
      defaultPath: `${suggested}.zerda`,
      filters: [{ name: 'Paczka ZerdaLauncher', extensions: ['zerda'] }]
    });
    if (res.canceled || !res.filePath) return null;
    exportInstance(instanceId, res.filePath);
    return res.filePath;
  });

  // Accounts
  ipcMain.handle(IPC.accountsList, () => listAccounts());
  ipcMain.handle(IPC.accountsActive, () => activeAccountId());
  // Fetch a player's skin texture as a data URL (for the 3D viewer). mc-heads
  // accepts both UUIDs (premium) and names (offline), returning Steve as default.
  ipcMain.handle(IPC.accountsSkin, (_e, id: string) =>
    fetchAsDataUrl(`https://mc-heads.net/skin/${encodeURIComponent(id)}`)
  );
  ipcMain.handle(IPC.accountsSelectActive, (_e, id: string) => selectActive(id));
  ipcMain.handle(IPC.accountsRemove, (_e, id: string) => removeAccount(id));
  ipcMain.handle(IPC.accountsOfflineLogin, (_e, username: string) => createOfflineAccount(username));
  ipcMain.handle(IPC.accountsMicrosoftLogin, async () => {
    const win = getMainWindow() ?? undefined;
    const acc = await microsoftLogin(win);
    addAccount(acc);
    selectActive(acc.id);
    return acc;
  });

  // Settings
  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, patch: Partial<AppSettings>) => {
    const prev = getSettings();
    const next = { ...prev, ...patch };
    writeJson(paths.settings, next);
    if (next.discordClientId !== prev.discordClientId) void reinitDiscord();
    return next;
  });

  // System
  ipcMain.handle(IPC.systemDetectJava, () => detectJava(getSettings().javaPath || undefined));
  ipcMain.handle(IPC.appVersion, () => app.getVersion());

  // Self-update
  ipcMain.handle(IPC.updateCheck, () => {
    checkForUpdates();
    return currentStatus();
  });
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall());

  // Launch
  ipcMain.handle(IPC.mcLaunch, async (_e, instanceId: string) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('Brak instancji.');
    const activeId = activeAccountId();
    const accounts = listAccounts();
    let acc = accounts.find((a) => a.id === activeId) ?? accounts[0];
    if (!acc) throw new Error('Brak konta — zaloguj się.');
    acc = await ensureFreshToken(acc);

    const status = (s: LaunchStatus['state'], message?: string) =>
      emitToAll(IPC.mcLaunchStatus, { instanceId, state: s, message } satisfies LaunchStatus);
    const progress = (phase: string, current: number, total: number, msg?: string) =>
      emitToAll(IPC.mcLaunchProgress, {
        instanceId,
        phase,
        current,
        total,
        message: msg
      } satisfies DownloadProgress);

    try {
      status('preparing', 'Sprawdzam pliki');
      // Resolve the version id to actually launch. For modded instances this
      // installs the loader; if loaderVersion is missing we self-heal by
      // resolving the latest available — never silently fall back to vanilla.
      const resolvedId = await resolveLaunchVersion(instance, status);

      status('downloading', 'Pobieram pliki gry');
      const prepared = await prepareVersion(resolvedId, instance.id, progress);

      status('launching', 'Przygotowuję środowisko Java');
      const javaExe = await resolveJava(instance, prepared.data, getSettings(), progress);

      status('launching', 'Uruchamiam Minecraft');
      const playStart = Date.now();
      launchGame({
        instance,
        account: acc,
        prepared,
        javaExe,
        onExit: (code) => {
          // Accumulate playtime for stats, drop Discord presence back to idle.
          const inst = getInstance(instance.id);
          updateInstance(instance.id, {
            playtimeMs: (inst?.playtimeMs ?? 0) + (Date.now() - playStart),
            lastPlayed: Date.now()
          });
          setIdle();
          status('stopped', `Gra zakończona (kod ${code ?? 0})`);
        },
        onLog: (line) => {
          process.stdout.write(line);
          emitToAll(IPC.mcLog, { instanceId, line });
        }
      });
      updateInstance(instance.id, {
        lastPlayed: Date.now(),
        sessions: (instance.sessions ?? 0) + 1
      });
      setPlaying(instance.name, `${instance.mcVersion} · ${instance.loader}`);
      status('running', 'Gra uruchomiona');
    } catch (err) {
      status('error', (err as Error).message);
      throw err;
    }
  });
}

/**
 * Resolve the concrete version id to launch. Vanilla launches its MC version
 * directly; modded loaders get installed (Fabric/Forge/NeoForge). If a modded
 * instance has no stored loaderVersion (e.g. created before a version list was
 * available), we resolve the latest compatible one and persist it — so we never
 * accidentally launch vanilla for a "modded" instance.
 */
async function resolveLaunchVersion(
  instance: Instance,
  status: (s: LaunchStatus['state'], message?: string) => void
): Promise<string> {
  if (instance.loader === 'vanilla') return instance.mcVersion;

  let loaderVersion = instance.loaderVersion;
  if (!loaderVersion) {
    status('preparing', `Ustalam wersję ${instance.loader}…`);
    loaderVersion = await latestLoaderVersion(instance.loader, instance.mcVersion);
    if (!loaderVersion) {
      throw new Error(
        `Nie znaleziono wersji „${instance.loader}" dla Minecraft ${instance.mcVersion}. ` +
          `Otwórz instancję i wybierz wersję loadera albo użyj wersji MC wspieranej przez ${instance.loader}.`
      );
    }
    updateInstance(instance.id, { loaderVersion });
  }

  if (instance.loader === 'fabric') return installFabric(instance.mcVersion, loaderVersion);
  if (instance.loader === 'forge') return installForge(instance.mcVersion, loaderVersion);
  if (instance.loader === 'neoforge') return installNeoForge(loaderVersion);
  return instance.mcVersion;
}

/** Newest available loader version for an MC version, or undefined if none. */
async function latestLoaderVersion(loader: ModLoader, mc: string): Promise<string | undefined> {
  if (loader === 'fabric') return (await fabricLoaders(mc))[0];
  if (loader === 'forge') {
    const f = await forgeVersionsFor(mc);
    return f.recommended ?? f.latest;
  }
  if (loader === 'neoforge') return (await neoforgeVersionsFor(mc)).latest;
  return undefined;
}
