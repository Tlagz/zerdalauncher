import { app, BrowserWindow } from 'electron';
import * as electronUpdater from 'electron-updater';
import { IPC } from '../shared/ipc-channels';
import type { UpdateStatus } from '../shared/types';

// electron-updater is CommonJS; grab the singleton via namespace interop.
const { autoUpdater } = electronUpdater;

let getWin: () => BrowserWindow | null = () => null;
let lastStatus: UpdateStatus = { state: 'none', version: app.getVersion() };

function send(status: UpdateStatus): void {
  lastStatus = status;
  getWin()?.webContents.send(IPC.updateStatus, status);
}

export function currentStatus(): UpdateStatus {
  return lastStatus;
}

export function initUpdater(win: () => BrowserWindow | null): void {
  getWin = win;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => send({ state: 'checking' }));
  autoUpdater.on('update-available', (i) => send({ state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', (i) => send({ state: 'none', version: i.version }));
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) })
  );
  autoUpdater.on('update-downloaded', (i) => send({ state: 'ready', version: i.version }));
  autoUpdater.on('error', (e) =>
    send({ state: 'error', message: e == null ? 'Nieznany błąd aktualizacji' : e.message || String(e) })
  );
}

/** Trigger an update check. No-op (reports 'disabled') in dev / unpackaged. */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    send({ state: 'disabled' });
    return;
  }
  autoUpdater
    .checkForUpdates()
    .catch((e) => send({ state: 'error', message: (e as Error).message }));
}

export function quitAndInstall(): void {
  // isSilent=false (show installer), isForceRunAfter=true (relaunch after update).
  autoUpdater.quitAndInstall(false, true);
}
