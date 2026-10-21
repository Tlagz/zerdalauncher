import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { protocol, net, nativeImage, clipboard, shell } from 'electron';
import { instanceGameDir } from '../utils/paths';
import { listInstances } from './instances';
import type { ScreenshotEntry, ScreenshotInfo } from '../../shared/types';

export const SHOT_SCHEME = 'zerda-shot';
const IMAGE = /\.(png|jpe?g)$/i;

export function screenshotsDir(instanceId: string): string {
  return path.join(instanceGameDir(instanceId), 'screenshots');
}

/** Absolute path of a screenshot, refusing names that aren't plain files in the folder. */
function shotPath(instanceId: string, name: string): string {
  if (!IMAGE.test(name) || name !== path.basename(name)) throw new Error('Nieprawidłowa nazwa pliku.');
  return path.join(screenshotsDir(instanceId), name);
}

export function listScreenshots(instanceId: string): ScreenshotInfo[] {
  const dir = screenshotsDir(instanceId);
  if (!fs.existsSync(dir)) return [];
  const out: ScreenshotInfo[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!IMAGE.test(name)) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      out.push({ name, size: st.size, takenAt: st.mtimeMs });
    } catch {
      /* vanished meanwhile */
    }
  }
  return out.sort((a, b) => b.takenAt - a.takenAt);
}

/** Every instance's screenshots, newest first. */
export function listAllScreenshots(): ScreenshotEntry[] {
  return listInstances()
    .flatMap((inst) => listScreenshots(inst.id).map((s) => ({ ...s, instanceId: inst.id, instanceName: inst.name })))
    .sort((a, b) => b.takenAt - a.takenAt);
}

export function copyScreenshot(instanceId: string, name: string): void {
  const img = nativeImage.createFromPath(shotPath(instanceId, name));
  if (img.isEmpty()) throw new Error('Nie udało się wczytać obrazu.');
  clipboard.writeImage(img);
}

/** Moves the file to the Recycle Bin (recoverable). */
export async function deleteScreenshot(instanceId: string, name: string): Promise<ScreenshotInfo[]> {
  await shell.trashItem(shotPath(instanceId, name));
  return listScreenshots(instanceId);
}

export function revealScreenshot(instanceId: string, name: string): void {
  shell.showItemInFolder(shotPath(instanceId, name));
}

export function openScreenshotsFolder(instanceId: string): Promise<string> {
  const dir = screenshotsDir(instanceId);
  fs.mkdirSync(dir, { recursive: true });
  return shell.openPath(dir);
}

// Small JPEG thumbnails, keyed by path + mtime so a re-taken screenshot refreshes.
const thumbs = new Map<string, Buffer>();

async function thumbnail(file: string): Promise<Buffer> {
  const key = `${file}|${fs.statSync(file).mtimeMs}`;
  let buf = thumbs.get(key);
  if (!buf) {
    const img = nativeImage.createFromPath(file);
    const { width } = img.getSize();
    buf = (width > 480 ? img.resize({ width: 480, quality: 'good' }) : img).toJPEG(82);
    if (thumbs.size > 400) thumbs.clear();
    thumbs.set(key, buf);
  }
  return buf;
}

/**
 * Serves `zerda-shot://shot/<instanceId>/<file>[?thumb=1]` so the renderer can
 * show screenshots without reading whole files over IPC.
 */
export function registerShotProtocol(): void {
  protocol.handle(SHOT_SCHEME, async (req) => {
    try {
      const url = new URL(req.url);
      const [, instanceId, name] = url.pathname.split('/').map(decodeURIComponent);
      const file = shotPath(instanceId, name);
      if (!fs.existsSync(file)) return new Response('not found', { status: 404 });
      if (url.searchParams.has('thumb')) {
        return new Response(new Uint8Array(await thumbnail(file)), { headers: { 'content-type': 'image/jpeg' } });
      }
      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('bad request', { status: 400 });
    }
  });
}
