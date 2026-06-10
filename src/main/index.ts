import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { ensureDirs } from './utils/paths';
import { registerIpc } from './ipc';
import { importPackFile } from './mods/modpacks';
import { initUpdater, checkForUpdates } from './updater';
import { initDiscord } from './discord';
import { killAllServers } from './server';
import { IPC } from '../shared/ipc-channels';

let mainWindow: BrowserWindow | null = null;

/** Pick a supported pack file path out of argv (set when opened via double-click). */
function findPackArg(argv: string[]): string | null {
  for (const a of argv) {
    if (/\.(zerda|mrpack|zip)$/i.test(a) && fs.existsSync(a)) return a;
  }
  return null;
}

/** Import a pack file that the OS handed us (file association / "open with"). */
async function importExternalPack(filePath: string): Promise<void> {
  const win = mainWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const send = (channel: string, payload: unknown) => win.webContents.send(channel, payload);
  try {
    send(IPC.packProgress, { current: 0, total: 1, message: 'Importuję paczkę…' });
    const id = await importPackFile(filePath, (current, total, message) =>
      send(IPC.packProgress, { current, total, message })
    );
    send(IPC.packImported, { ok: true, id, name: path.basename(filePath) });
  } catch (e) {
    send(IPC.packImported, { ok: false, error: (e as Error).message });
  }
}

function createWindow(): void {
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'ZerdaLauncher',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Once the renderer is ready: import a double-clicked .zerda (if any) and
  // kick off a background update check.
  const initialFile = findPackArg(process.argv.slice(1));
  mainWindow.webContents.once('did-finish-load', () => {
    if (initialFile) void importExternalPack(initialFile);
    checkForUpdates();
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

// Single instance: opening a second .zerda routes the file to the running app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const file = findPackArg(argv.slice(1));
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (file) void importExternalPack(file);
  });

  // macOS "open-with" (harmless on Windows).
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    if (mainWindow) void importExternalPack(filePath);
    else process.argv.push(filePath);
  });

  app.whenReady().then(() => {
    ensureDirs();
    initUpdater(() => mainWindow);
    void initDiscord();
    registerIpc(() => mainWindow);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => killAllServers());
  app.on('window-all-closed', () => {
    killAllServers();
    if (process.platform !== 'darwin') app.quit();
  });
}
