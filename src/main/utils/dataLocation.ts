import fs from 'fs';
import path from 'path';
import { paths, MOVABLE_DATA_DIRS } from './paths';
import type { DataLocationInfo } from '../../shared/types';

export function getDataLocation(): DataLocationInfo {
  return {
    current: paths.data,
    isDefault: path.resolve(paths.data) === path.resolve(paths.root),
    defaultDir: paths.root,
    unavailable: paths.dataUnavailable
  };
}

/** Where data ends up for a folder the user picked: always a "ZerdaLauncher" subfolder. */
export function resolveTarget(picked: string): string {
  return path.basename(picked).toLowerCase() === 'zerdalauncher' ? picked : path.join(picked, 'ZerdaLauncher');
}

interface FileEntry {
  from: string;
  to: string;
  size: number;
}

function listFiles(srcDir: string, dstDir: string, out: FileEntry[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(srcDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const from = path.join(srcDir, e.name);
    const to = path.join(dstDir, e.name);
    if (e.isDirectory()) listFiles(from, to, out);
    else if (e.isFile()) out.push({ from, to, size: fs.statSync(from).size });
  }
}

/**
 * In the installed app the config root is also Electron's userData, whose
 * Chromium "Cache" folder is the same directory as our "cache" on Windows
 * (case-insensitive) and is locked while running. Our cache only holds
 * re-downloadable installers, so it stays put whenever the config root is involved.
 */
function dirsToMove(from: string, to: string): string[] {
  const root = path.resolve(paths.root);
  const touchesRoot = path.resolve(from) === root || path.resolve(to) === root;
  return MOVABLE_DATA_DIRS.filter((n) => n !== 'cache' || !touchesRoot);
}

/** Total size in bytes of the data that would be moved to `target`. */
export function movableSize(target: string): number {
  const files: FileEntry[] = [];
  for (const name of dirsToMove(paths.data, target)) listFiles(path.join(paths.data, name), '', files);
  return files.reduce((s, f) => s + f.size, 0);
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Move every game-data folder to `target`. Same-drive moves are instant renames;
 * cross-drive moves copy file by file (with progress) and only delete the
 * originals once everything copied, so a failure leaves the old data intact.
 */
export async function moveData(
  target: string,
  progress: (done: number, total: number, message: string) => void
): Promise<void> {
  if (!path.isAbsolute(target)) throw new Error('Nieprawidłowa ścieżka docelowa.');
  const from = path.resolve(paths.data);
  const to = path.resolve(target);
  if (from === to) return;
  const dirs = dirsToMove(from, to);
  for (const name of MOVABLE_DATA_DIRS) {
    if (isInside(to, path.join(from, name)) || to === path.join(from, name)) {
      throw new Error('Nie można przenieść danych do folderu wewnątrz obecnej lokalizacji.');
    }
  }
  fs.mkdirSync(to, { recursive: true });
  for (const name of dirs) {
    const dst = path.join(to, name);
    if (fs.existsSync(dst) && fs.readdirSync(dst).length > 0) {
      throw new Error(`W wybranym folderze są już dane launchera (${dst}). Wybierz pusty folder.`);
    }
  }

  const files: FileEntry[] = [];
  const renamed: string[] = [];
  const copiedDirs: string[] = [];
  try {
    for (const name of dirs) {
      const src = path.join(from, name);
      if (!fs.existsSync(src)) continue;
      const dst = path.join(to, name);
      try {
        fs.rmSync(dst, { recursive: true, force: true });
        fs.renameSync(src, dst);
        renamed.push(name);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e;
        listFiles(src, dst, files);
        copiedDirs.push(name);
      }
    }

    if (files.length) {
      const total = files.reduce((s, f) => s + f.size, 0);
      const free = fs.statfsSync(to);
      if (free.bavail * free.bsize < total) {
        throw new Error(`Za mało miejsca na dysku docelowym (potrzeba ${(total / 1024 ** 3).toFixed(1)} GB).`);
      }
      let done = 0;
      let last = 0;
      for (const f of files) {
        await fs.promises.mkdir(path.dirname(f.to), { recursive: true });
        await fs.promises.copyFile(f.from, f.to);
        done += f.size;
        if (Date.now() - last > 100) {
          last = Date.now();
          progress(done, total, path.relative(from, f.from));
        }
      }
      progress(total, total, 'Usuwam stare pliki…');
      for (const name of copiedDirs) fs.rmSync(path.join(from, name), { recursive: true, force: true });
    }
  } catch (err) {
    // Undo: put renamed folders back and drop partial copies; originals stay.
    for (const name of renamed) {
      try {
        fs.renameSync(path.join(to, name), path.join(from, name));
      } catch {
        /* best effort */
      }
    }
    for (const name of copiedDirs) fs.rmSync(path.join(to, name), { recursive: true, force: true });
    throw err;
  }

  // Leaving a custom folder: its installer cache wasn't moved (see dirsToMove) —
  // it's re-downloadable, so drop it, and the folder itself if nothing else is left.
  if (!dirs.includes('cache') && from !== path.resolve(paths.root)) {
    fs.rmSync(path.join(from, 'cache'), { recursive: true, force: true });
    try {
      if (fs.readdirSync(from).length === 0) fs.rmdirSync(from);
    } catch {
      /* keep the folder if anything else is in it */
    }
  }

  if (path.resolve(to) === path.resolve(paths.root)) {
    fs.rmSync(paths.locationFile, { force: true });
  } else {
    fs.writeFileSync(paths.locationFile, JSON.stringify({ dataRoot: to }, null, 2));
  }
}
