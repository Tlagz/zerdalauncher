import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { instanceGameDir, instanceDir } from '../utils/paths';
import type { WorldInfo } from '../../shared/types';

function savesDir(id: string): string {
  return path.join(instanceGameDir(id), 'saves');
}
function backupsDir(id: string): string {
  return path.join(instanceDir(id), 'backups');
}

function dirSize(root: string): number {
  let total = 0;
  const walk = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp);
      else
        try {
          total += fs.statSync(fp).size;
        } catch {
          /* ignore */
        }
    }
  };
  walk(root);
  return total;
}

export function listWorlds(id: string): WorldInfo[] {
  const dir = savesDir(id);
  if (!fs.existsSync(dir)) return [];
  const out: WorldInfo[] = [];
  for (const name of fs.readdirSync(dir)) {
    const folder = path.join(dir, name);
    let st: fs.Stats;
    try {
      st = fs.statSync(folder);
    } catch {
      continue;
    }
    if (!st.isDirectory() || !fs.existsSync(path.join(folder, 'level.dat'))) continue;
    let lastPlayed: number | undefined;
    try {
      lastPlayed = fs.statSync(path.join(folder, 'level.dat')).mtimeMs;
    } catch {
      /* ignore */
    }
    out.push({ name, folder, sizeMb: dirSize(folder) / (1024 * 1024), lastPlayed });
  }
  return out.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
}

/** Zip a world into the instance's backups/ folder, return the archive path. */
export function backupWorld(id: string, worldName: string): string {
  const src = path.join(savesDir(id), worldName);
  if (!fs.existsSync(src)) throw new Error('Świat nie istnieje.');
  const out = backupsDir(id);
  fs.mkdirSync(out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(out, `${worldName}-${stamp}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(src, worldName);
  zip.writeZip(dest);
  return dest;
}

/** Restore a world from a backup zip into saves/ (zip should contain the world folder). */
export function restoreWorld(id: string, zipPath: string): void {
  const dir = savesDir(id);
  fs.mkdirSync(dir, { recursive: true });
  new AdmZip(zipPath).extractAllTo(dir, true);
}

export function deleteWorld(id: string, worldName: string): void {
  const src = path.join(savesDir(id), worldName);
  fs.rmSync(src, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
}

export function savesFolder(id: string): string {
  return savesDir(id);
}
