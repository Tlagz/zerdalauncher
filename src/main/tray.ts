import { app, Menu, Tray, nativeImage, type BrowserWindow } from 'electron';
import iconPath from '../../build/tray.png?asset';
import { listInstances } from './minecraft/instances';
import { readJson } from './utils/store';
import { paths } from './utils/paths';
import { tr } from '../shared/i18n';
import type { AppSettings } from '../shared/types';
import { IPC } from '../shared/ipc-channels';

let tray: Tray | null = null;
let getWin: () => BrowserWindow | null = () => null;
let running: () => string[] = () => [];
let stopGame: (id: string) => void = () => undefined;
let tooltip = 'ZerdaLauncher';
/** Set while quitting so closing the window really quits. */
export let quitting = false;

const L = (text: string) => tr(text, readJson<Partial<AppSettings>>(paths.settings, {}).language ?? 'pl');

export function showWindow(): void {
  const win = getWin();
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildMenu(): Menu {
  const ids = running();
  const instances = listInstances();
  const name = (id: string) => instances.find((i) => i.id === id)?.name ?? id;
  const recent = instances
    .filter((i) => i.lastPlayed && !ids.includes(i.id))
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 5);
  return Menu.buildFromTemplate([
    { label: L('Pokaż ZerdaLauncher'), click: showWindow },
    { type: 'separator' },
    ...ids.map((id) => ({ label: `${L('Zatrzymaj')}: ${name(id)}`, click: () => stopGame(id) })),
    ...(recent.length
      ? [
          {
            label: L('Graj'),
            submenu: recent.map((i) => ({
              label: i.name,
              click: () => getWin()?.webContents.send(IPC.trayLaunch, i.id)
            }))
          }
        ]
      : []),
    { type: 'separator' },
    {
      label: L('Zakończ'),
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
}

/** Tray icon: show the launcher, quick-launch recent instances, stop a running game. */
export function initTray(opts: {
  getWindow: () => BrowserWindow | null;
  runningGames: () => string[];
  stopGame: (id: string) => void;
}): void {
  getWin = opts.getWindow;
  running = opts.runningGames;
  stopGame = opts.stopGame;
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip(tooltip);
  tray.on('click', showWindow);
  // Rebuilt on open so running games and recent instances are current.
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()));
  app.on('before-quit', () => {
    quitting = true;
  });
}

/** A system notification bubble from the tray icon (texts are Polish keys, translated here). */
export function trayNotice(title: string, content: string): void {
  tray?.displayBalloon({ iconType: 'info', title: L(title), content: L(content) });
}

export function setTrayTooltip(text: string): void {
  tooltip = text.slice(0, 127);
  tray?.setToolTip(tooltip);
}
