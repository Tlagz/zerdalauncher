import { ipcMain, shell, dialog, BrowserWindow, nativeImage, app } from 'electron';
import type { ChildProcess } from 'child_process';
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
  duplicateInstance,
  copyGameSettings
} from './minecraft/instances';
import { fetchVersionManifest } from './minecraft/manifest';
import { prepareVersion } from './minecraft/downloader';
import { resolveJava, listJreStatus, deleteJre, ensureMojangJre } from './minecraft/jre';
import { launchGame } from './minecraft/launcher';
import { analyzeCrash } from './minecraft/crashAnalyzer';
import { applyCrashFix } from './minecraft/crashFixes';
import { latestLoaderVersion } from './modloaders/latest';
import { minecraftNews, minecraftPatchNotes } from './news';
import { uiSounds } from './sounds';
import { createActivityTracker } from './minecraft/gameActivity';
import { createInvite, inviteFromClipboard, previewInvite, acceptInvite } from './invites';
import { monitorGame } from './minecraft/gameMonitor';
import { setTrayTooltip, showWindow, trayNotice } from './tray';
import { openMap } from './map';
import * as packs from './packs';
import { readPlaylog, logSession } from './minecraft/playlog';
import { listSavedServers } from './minecraft/savedServers';
import { pingServer } from './minecraft/serverPing';
import * as modrinthApi from './mods/modrinth';
import * as curseforgeApi from './mods/curseforge';
import {
  listScreenshots,
  listAllScreenshots,
  copyScreenshot,
  deleteScreenshot,
  revealScreenshot,
  openScreenshotsFolder
} from './minecraft/screenshots';
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
  updateContent,
  fetchInstalledIcons
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
import {
  listSkins,
  addSkinFromFile,
  updateSkin,
  deleteSkin,
  skinDataUrl,
  applySkin,
  resetSkin
} from './auth/skins';
import { paths, instanceDir, instanceGameDir } from './utils/paths';
import { getDataLocation, resolveTarget, movableSize, moveData } from './utils/dataLocation';
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
  setProps,
  runningServerIds
} from './server';
import { initTunnel, startTunnel, stopTunnel } from './server/tunnel';
import { serverDir } from './utils/paths';
import type { AppSettings, ContentKind, CrashFix, ExportOptions, Instance, Invite, MapTarget, PublishRequest } from '../shared/types';
import type { ThemePresetFile } from '../shared/appearance';
import { tr } from '../shared/i18n';
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

/** Native dialog texts in the UI language (they don't pass through the renderer's translator). */
const L = (text: string) => tr(text, getSettings().language ?? 'pl');

function emitToAll(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload);
}

// Game processes by instance id, plus instances still being prepared (downloads,
// loader install) so a second "Graj" can't start the same instance twice.
const games = new Map<string, ChildProcess>();
const starting = new Set<string>();
const emitRunning = () => emitToAll(IPC.mcRunning, [...games.keys()]);
// Games the user stopped with "Zabij grę" — their exit isn't a crash.
const killed = new Set<string>();
// The window was hidden to the tray because a game started (Settings → hide while playing).
let hiddenForGame = false;

export const runningGameIds = (): string[] => [...games.keys()];

/** Stop a running game on purpose (not reported as a crash). */
export function killGame(instanceId: string): void {
  const child = games.get(instanceId);
  if (!child) return;
  killed.add(instanceId);
  child.kill();
}
const GAME_LOG_CAP = 600_000;

export function registerIpc(getMainWindow: () => BrowserWindow | null): void {
  // Instances
  ipcMain.handle(IPC.instancesList, () => listInstances());
  ipcMain.handle(IPC.instancesCreate, (_e, opts) => createInstance(opts));
  ipcMain.handle(IPC.instancesUpdate, (_e, id, patch) => updateInstance(id, patch));
  ipcMain.handle(IPC.instancesDelete, (_e, id) => deleteInstance(id));
  ipcMain.handle(IPC.instancesDuplicate, (_e, id) => duplicateInstance(id));
  ipcMain.handle(IPC.instancesCopySettings, (_e, fromId: string, toId: string, servers: boolean) => {
    // The game writes options.txt when it closes, which would undo the copy.
    if (games.has(toId)) throw new Error('Zamknij grę w tej instancji przed kopiowaniem ustawień.');
    return copyGameSettings(fromId, toId, servers);
  });
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
    return startTunnel(id, srv.port, srv.name);
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
      title: L('Przywróć świat z kopii'),
      properties: ['openFile'],
      filters: [{ name: L('Kopia świata'), extensions: ['zip'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    restoreWorld(id, res.filePaths[0]);
    return listWorlds(id);
  });

  // Screenshots
  ipcMain.handle(IPC.screenshotsList, (_e, id: string) => listScreenshots(id));
  ipcMain.handle(IPC.screenshotsAll, () => listAllScreenshots());
  ipcMain.handle(IPC.screenshotsCopy, (_e, id: string, name: string) => copyScreenshot(id, name));
  ipcMain.handle(IPC.screenshotsDelete, (_e, id: string, name: string) => deleteScreenshot(id, name));
  ipcMain.handle(IPC.screenshotsReveal, (_e, id: string, name: string) => revealScreenshot(id, name));
  ipcMain.handle(IPC.screenshotsOpenFolder, (_e, id: string) => openScreenshotsFolder(id));

  ipcMain.handle(IPC.instancesPickIcon, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L('Wybierz ikonę instancji'),
      properties: ['openFile'],
      filters: [{ name: L('Obrazy'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
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
  ipcMain.handle(IPC.modsInstall, (_e, instanceId: string, kind, file, withDeps: boolean, iconUrl?: string) =>
    installContent(instanceId, kind, file, withDeps, iconUrl)
  );
  ipcMain.handle(IPC.modsInstalled, (_e, instanceId: string, kind) =>
    listInstalledContent(instanceId, kind)
  );
  ipcMain.handle(IPC.modsFetchIcons, (_e, instanceId: string, kind) =>
    fetchInstalledIcons(instanceId, kind)
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
  ipcMain.handle(IPC.modsPickLocal, async (_e, instanceId: string, kind: ContentKind) => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L(kind === 'mod' ? 'Wybierz mody z komputera (.jar)' : 'Wybierz pliki z komputera (.zip)'),
      properties: ['openFile', 'multiSelections'],
      filters:
        kind === 'mod'
          ? [{ name: L('Mody (.jar)'), extensions: ['jar'] }]
          : [{ name: L('Paczki (.zip)'), extensions: ['zip'] }]
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return addLocalContent(instanceId, kind, res.filePaths);
  });
  ipcMain.handle(IPC.modsDetails, (_e, provider: string, projectId: string) =>
    (provider === 'curseforge' ? curseforgeApi : modrinthApi).getProjectDetails(projectId)
  );
  ipcMain.handle(IPC.modsChangelog, (_e, provider: string, projectId: string, mc: string, loader: string) =>
    (provider === 'curseforge' ? curseforgeApi : modrinthApi).getProjectChangelog(projectId, mc, loader)
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
      title: L('Importuj paczkę'),
      properties: ['openFile'],
      filters: [{ name: L('Paczki modów'), extensions: ['mrpack', 'zerda', 'zip'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return importPackFile(res.filePaths[0], packProgress);
  });
  ipcMain.handle(IPC.packExport, async (_e, instanceId: string, opts: ExportOptions) => {
    const win = getMainWindow() ?? undefined;
    const instance = getInstance(instanceId);
    const suggested = (instance?.name ?? 'modpack').replace(/[^\w.-]+/g, '_');
    const ext = opts.format === 'mrpack' ? 'mrpack' : 'zerda';
    const res = await dialog.showSaveDialog(win!, {
      title: L('Eksportuj paczkę'),
      defaultPath: `${suggested}.${ext}`,
      filters: [
        ext === 'mrpack'
          ? { name: L('Modpack Modrinth'), extensions: ['mrpack'] }
          : { name: L('Paczka ZerdaLauncher'), extensions: ['zerda'] }
      ]
    });
    if (res.canceled || !res.filePath) return null;
    await exportInstance(instanceId, res.filePath, opts, packProgress);
    return res.filePath;
  });

  // Accounts
  ipcMain.handle(IPC.accountsList, () => listAccounts());
  ipcMain.handle(IPC.accountsActive, () => activeAccountId());
  // Fetch the skin texture as a data URL (for the 3D viewer). If the account has
  // a local library skin set, that wins (so the viewer updates instantly); else
  // mc-heads by UUID (premium) or name (offline), returning Steve as default.
  ipcMain.handle(IPC.accountsSkin, (_e, accountOrId: string) => {
    const acc = listAccounts().find((a) => a.id === accountOrId);
    if (acc?.skinId) {
      const local = skinDataUrl(acc.skinId);
      if (local) return local;
    }
    const key = acc ? (acc.type === 'microsoft' ? acc.uuid : acc.username) : accountOrId;
    return fetchAsDataUrl(`https://mc-heads.net/skin/${encodeURIComponent(key)}`);
  });
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

  // Skin library
  ipcMain.handle(IPC.skinsList, () => listSkins());
  ipcMain.handle(IPC.skinsData, (_e, id: string) => skinDataUrl(id));
  ipcMain.handle(IPC.skinsAdd, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L('Wybierz skina (PNG 64×64)'),
      filters: [{ name: 'Skin PNG', extensions: ['png'] }],
      properties: ['openFile', 'multiSelections']
    });
    if (res.canceled || res.filePaths.length === 0) return { added: 0, skins: listSkins() };
    let added = 0;
    let lastError: string | null = null;
    for (const fp of res.filePaths) {
      try {
        addSkinFromFile(fp);
        added++;
      } catch (e) {
        lastError = (e as Error).message;
      }
    }
    if (added === 0 && lastError) throw new Error(lastError);
    return { added, skins: listSkins() };
  });
  ipcMain.handle(IPC.skinsUpdate, (_e, id: string, patch) => updateSkin(id, patch));
  ipcMain.handle(IPC.skinsDelete, (_e, id: string) => deleteSkin(id));
  ipcMain.handle(IPC.skinsApply, (_e, accountId: string, skinId: string) =>
    applySkin(accountId, skinId)
  );
  ipcMain.handle(IPC.skinsReset, (_e, accountId: string) => resetSkin(accountId));

  // Personalization: custom background image (kept as a single file in the config root)
  const BG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  const bgFile = () => BG_EXT.map((e) => path.join(paths.root, `background.${e}`)).find((f) => fs.existsSync(f));
  const bgDataUrl = (file: string) => {
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
  };
  ipcMain.handle(IPC.appearanceBackground, () => {
    const f = bgFile();
    return f ? bgDataUrl(f) : null;
  });
  ipcMain.handle(IPC.appearancePickBackground, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L('Wybierz obraz tła'),
      properties: ['openFile'],
      filters: [{ name: L('Obrazy'), extensions: BG_EXT }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const src = res.filePaths[0];
    if (fs.statSync(src).size > 15 * 1024 * 1024) throw new Error('Obraz jest za duży (max 15 MB).');
    const old = bgFile();
    if (old) fs.rmSync(old, { force: true });
    const dest = path.join(paths.root, `background.${path.extname(src).slice(1).toLowerCase()}`);
    fs.copyFileSync(src, dest);
    return bgDataUrl(dest);
  });
  ipcMain.handle(IPC.appearanceClearBackground, () => {
    const f = bgFile();
    if (f) fs.rmSync(f, { force: true });
  });
  ipcMain.handle(IPC.appearanceSounds, () => uiSounds());
  // Theme presets as shareable .zerdatheme files (JSON, optionally with the background image).
  ipcMain.handle(
    IPC.appearanceExportPreset,
    async (_e, preset: Pick<ThemePresetFile, 'name' | 'theme' | 'look'>, withImage: boolean) => {
      const win = getMainWindow() ?? undefined;
      const res = await dialog.showSaveDialog(win!, {
        title: L('Eksportuj motyw'),
        defaultPath: `${preset.name.replace(/[^\w.-]+/g, '_') || 'motyw'}.zerdatheme`,
        filters: [{ name: L('Motyw ZerdaLauncher'), extensions: ['zerdatheme'] }]
      });
      if (res.canceled || !res.filePath) return null;
      const img = withImage ? bgFile() : undefined;
      const file: ThemePresetFile = {
        type: 'zerda-theme',
        version: 1,
        name: preset.name,
        theme: preset.theme,
        look: preset.look,
        ...(img ? { backgroundImage: bgDataUrl(img) } : {})
      };
      fs.writeFileSync(res.filePath, JSON.stringify(file));
      return res.filePath;
    }
  );
  ipcMain.handle(IPC.appearanceImportPreset, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L('Importuj motyw'),
      properties: ['openFile'],
      filters: [{ name: L('Motyw ZerdaLauncher'), extensions: ['zerdatheme', 'json'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    if (fs.statSync(res.filePaths[0]).size > 25 * 1024 * 1024) throw new Error('Plik motywu jest za duży.');
    let file: ThemePresetFile;
    try {
      file = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    } catch {
      throw new Error('To nie jest plik motywu.');
    }
    if (file?.type !== 'zerda-theme' || typeof file.name !== 'string' || typeof file.look !== 'object') {
      throw new Error('To nie jest plik motywu ZerdaLauncher.');
    }
    // An embedded image becomes the current custom background.
    let backgroundImage: string | null = null;
    const m =
      typeof file.backgroundImage === 'string' &&
      file.backgroundImage.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
    if (m) {
      const old = bgFile();
      if (old) fs.rmSync(old, { force: true });
      const dest = path.join(paths.root, `background.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      fs.writeFileSync(dest, Buffer.from(m[2], 'base64'));
      backgroundImage = bgDataUrl(dest);
    }
    return { name: file.name.slice(0, 40), theme: String(file.theme || 'default'), look: file.look, backgroundImage };
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

  // Home news
  ipcMain.handle(IPC.newsMinecraft, () => minecraftNews());
  ipcMain.handle(IPC.newsPatchNotes, (_e, contentPath: string) => minecraftPatchNotes(contentPath));
  ipcMain.handle(IPC.statsPlaylog, () => readPlaylog());
  ipcMain.handle(IPC.mapOpen, (_e, target: MapTarget) => openMap(target));
  ipcMain.handle(IPC.packsList, (_e, fresh?: boolean) => packs.listPacks(!!fresh));
  ipcMain.handle(IPC.packsInstall, (_e, packId: string) => packs.installPack(packId, packProgress));
  ipcMain.handle(IPC.packsUpdate, (_e, instanceId: string) => packs.updatePackInstance(instanceId, packProgress));
  ipcMain.handle(IPC.packsStatus, () => packs.publisherStatus());
  ipcMain.handle(IPC.packsSetToken, (_e, token: string) => packs.setToken(token));
  ipcMain.handle(IPC.packsForgetToken, () => packs.forgetToken());
  ipcMain.handle(IPC.packsPublish, (_e, req: PublishRequest) => packs.publishPack(req, packProgress));
  ipcMain.handle(IPC.packsDelete, (_e, packId: string) => packs.deletePack(packId));
  // Pack banner: a wide image, scaled down to 1280 px and stored as JPEG.
  ipcMain.handle(IPC.packsPickBanner, async () => {
    const win = getMainWindow() ?? undefined;
    const res = await dialog.showOpenDialog(win!, {
      title: L('Wybierz baner paczki'),
      properties: ['openFile'],
      filters: [{ name: L('Obrazy'), extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    if (fs.statSync(res.filePaths[0]).size > 15 * 1024 * 1024) throw new Error('Obraz jest za duży (max 15 MB).');
    const img = nativeImage.createFromPath(res.filePaths[0]);
    if (img.isEmpty()) throw new Error('Nie udało się wczytać obrazu (nieobsługiwany format?).');
    const { width } = img.getSize();
    const scaled = width > 1280 ? img.resize({ width: 1280, quality: 'best' }) : img;
    return `data:image/jpeg;base64,${scaled.toJPEG(85).toString('base64')}`;
  });
  ipcMain.handle(IPC.invitesCreate, (_e, instanceId: string, address: string, name: string, from?: string) =>
    createInvite(instanceId, address, name, from)
  );
  ipcMain.handle(IPC.invitesFromClipboard, () => inviteFromClipboard());
  ipcMain.handle(IPC.invitesPreview, (_e, invite: Invite) => previewInvite(invite));
  ipcMain.handle(IPC.invitesAccept, (_e, invite: Invite, instanceId: string | null) => acceptInvite(invite, instanceId, packProgress));
  ipcMain.handle(IPC.savedServersList, () => listSavedServers());
  ipcMain.handle(IPC.savedServersPing, (_e, address: string) => pingServer(address));

  // System
  ipcMain.handle(IPC.systemDetectJava, () => detectJava(getSettings().javaPath || undefined));
  ipcMain.handle(IPC.appVersion, () => app.getVersion());

  // Java runtimes (manual download/management)
  ipcMain.handle(IPC.javaList, () => listJreStatus());
  ipcMain.handle(IPC.javaDownload, async (_e, component: string) => {
    await ensureMojangJre(component, (_phase, current, total, message) =>
      emitToAll(IPC.javaProgress, { component, current, total, message })
    );
    return listJreStatus();
  });
  ipcMain.handle(IPC.javaDelete, (_e, component: string) => {
    deleteJre(component);
    return listJreStatus();
  });

  // Self-update
  ipcMain.handle(IPC.updateCheck, () => {
    checkForUpdates();
    return currentStatus();
  });
  ipcMain.handle(IPC.updateInstall, () => quitAndInstall());

  // Running games
  ipcMain.handle(IPC.mcRunningList, () => [...games.keys()]);
  ipcMain.handle(IPC.mcKill, (_e, instanceId: string) => killGame(instanceId));
  ipcMain.handle(IPC.mcCrashFix, (_e, instanceId: string, fix: CrashFix) =>
    applyCrashFix(instanceId, fix, (current, total, message) =>
      emitToAll(IPC.mcCrashFixProgress, { instanceId, current, total, message })
    )
  );

  // Game data location
  const dataProgress = (done: number, total: number, message: string) =>
    emitToAll(IPC.dataProgress, { done, total, message });
  ipcMain.handle(IPC.dataLocation, () => getDataLocation());
  ipcMain.handle(IPC.dataOpen, () => shell.openPath(paths.data));
  ipcMain.handle(IPC.dataPick, async (_e, useDefault?: boolean) => {
    let target = paths.root;
    if (!useDefault) {
      const win = getMainWindow() ?? undefined;
      const res = await dialog.showOpenDialog(win!, {
        title: L('Wybierz folder na dane launchera'),
        properties: ['openDirectory', 'createDirectory']
      });
      if (res.canceled || !res.filePaths[0]) return null;
      target = resolveTarget(res.filePaths[0]);
    }
    return { target, bytes: movableSize(target) };
  });
  ipcMain.handle(IPC.dataMove, async (_e, target: string) => {
    if (games.size || starting.size) throw new Error('Zamknij grę przed przeniesieniem danych.');
    if (runningServerIds().length) throw new Error('Zatrzymaj serwery przed przeniesieniem danych.');
    await moveData(target, dataProgress);
    // Every path is resolved at startup, so restart onto the new location.
    app.relaunch();
    app.exit(0);
  });

  // Launch
  ipcMain.handle(IPC.mcLaunch, async (_e, instanceId: string, opts?: { world?: string; server?: string }) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('Brak instancji.');
    if (games.has(instanceId) || starting.has(instanceId)) throw new Error('Ta instancja już działa.');
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

    starting.add(instanceId);
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
      const settings = getSettings();
      let gameLog = '';
      let stopMonitor: () => void = () => undefined;
      killed.delete(instanceId);
      const activity = createActivityTracker({ world: opts?.world, server: opts?.server || instance.serverAddress });
      const child = launchGame({
        instance,
        account: acc,
        prepared,
        javaExe,
        quickPlayWorld: opts?.world,
        quickPlayServer: opts?.server,
        onExit: (code) => {
          games.delete(instanceId);
          emitRunning();
          stopMonitor();
          emitToAll(IPC.mcStats, { instanceId, ram: 0, cpu: 0, maxMb: instance.ramMb, ended: true });
          if (!games.size) {
            setTrayTooltip('ZerdaLauncher');
            // Back from the tray once the last game closes (also shows a crash dialog).
            if (hiddenForGame) {
              hiddenForGame = false;
              showWindow();
            }
          }
          // Accumulate playtime for stats, drop Discord presence back to idle.
          const inst = getInstance(instance.id);
          logSession(instance.id, playStart, Date.now() - playStart);
          updateInstance(instance.id, {
            playtimeMs: (inst?.playtimeMs ?? 0) + (Date.now() - playStart),
            lastPlayed: Date.now()
          });
          setIdle();
          status('stopped', `Gra zakończona (kod ${code ?? 0})`);
          if (killed.delete(instanceId)) return;
          try {
            const report = analyzeCrash({
              instance: getInstance(instance.id) ?? instance,
              exitCode: code,
              log: gameLog,
              startedAt: playStart,
              requiredJava: prepared.data.javaVersion?.majorVersion ?? 8,
              javaOverride: !!(instance.javaPath?.trim() || settings.javaPath?.trim())
            });
            if (report) emitToAll(IPC.mcCrash, report);
          } catch (e) {
            console.error('crash analysis failed', e);
          }
        },
        onLog: (line) => {
          process.stdout.write(line);
          gameLog = (gameLog + line).slice(-GAME_LOG_CAP);
          activity.onLog(line);
          emitToAll(IPC.mcLog, { instanceId, line });
        }
      });
      games.set(instanceId, child);
      emitRunning();
      const gb = (b: number) => (b / 1024 ** 3).toFixed(1);
      stopMonitor = monitorGame(child.pid ?? 0, (s) => {
        emitToAll(IPC.mcStats, { instanceId, ram: s.ram, cpu: s.cpu, maxMb: instance.ramMb });
        setTrayTooltip(`ZerdaLauncher — ${instance.name}: RAM ${gb(s.ram)} GB · CPU ${s.cpu}%`);
      });
      if (settings.closeOnLaunch) {
        const win = getMainWindow();
        if (win?.isVisible()) {
          win.hide();
          hiddenForGame = true;
          trayNotice('ZerdaLauncher działa w zasobniku', 'Wróci sam po zamknięciu gry. Możesz go też otworzyć z ikony.');
        }
      }
      updateInstance(instance.id, {
        lastPlayed: Date.now(),
        sessions: (instance.sessions ?? 0) + 1
      });
      setPlaying(instance.name, `${instance.mcVersion} · ${instance.loader}`, activity.initial);
      status('running', 'Gra uruchomiona');
    } catch (err) {
      status('error', (err as Error).message);
      throw err;
    } finally {
      starting.delete(instanceId);
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
