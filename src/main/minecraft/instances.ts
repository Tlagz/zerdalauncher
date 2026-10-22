import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { paths, instanceDir, instanceGameDir, ensureDirs, setInstanceFolderResolver } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import type { Instance, ModLoader } from '../../shared/types';

const FILE = path.join(paths.root, 'instances.json');

setInstanceFolderResolver((id) => listInstances().find((i) => i.id === id)?.dir ?? id);

export function listInstances(): Instance[] {
  ensureDirs();
  return readJson<Instance[]>(FILE, []);
}

export function saveInstances(items: Instance[]): void {
  writeJson(FILE, items);
}

// ---------- readable folder names ----------

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Turn an instance name into a safe Windows folder name. */
function folderBaseName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '');
  return cleaned && !WINDOWS_RESERVED.test(cleaned) ? cleaned : 'Instancja';
}

/** First free folder name for `name`, ignoring the folder `ownDir` (the instance's current one). */
function uniqueFolder(name: string, all: Instance[], ownDir?: string): string {
  const taken = new Set(
    all.map((i) => (i.dir ?? i.id).toLowerCase()).filter((d) => d !== ownDir?.toLowerCase())
  );
  const base = folderBaseName(name);
  let candidate = base;
  for (let n = 2; ; n++) {
    const free =
      !taken.has(candidate.toLowerCase()) &&
      (candidate.toLowerCase() === ownDir?.toLowerCase() || !fs.existsSync(path.join(paths.instances, candidate)));
    if (free) return candidate;
    candidate = `${base} (${n})`;
  }
}

/**
 * Move the instance's folder to match its name. Fails quietly (keeping the old
 * folder) when Windows has files locked, e.g. while the game is running.
 */
function renameFolder(inst: Instance, all: Instance[]): string | undefined {
  const current = inst.dir ?? inst.id;
  const target = uniqueFolder(inst.name, all, current);
  if (target === current) return current;
  const from = path.join(paths.instances, current);
  const to = path.join(paths.instances, target);
  try {
    if (fs.existsSync(from)) fs.renameSync(from, to);
    return target;
  } catch {
    return inst.dir;
  }
}

/** One-time move of legacy id-named folders to readable names (retried on next start if locked). */
export function migrateInstanceFolders(): void {
  const all = listInstances();
  let changed = false;
  for (const inst of all) {
    if (inst.dir) continue;
    const dir = renameFolder(inst, all);
    if (dir) {
      inst.dir = dir;
      changed = true;
    }
  }
  if (changed) saveInstances(all);
}

// ---------- CRUD ----------

export interface CreateOptions {
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  ramMb?: number;
  jvmArgs?: string;
  javaPath?: string;
}

export function createInstance(opts: CreateOptions): Instance {
  const all = listInstances();
  const name = opts.name.trim() || 'Nowa instancja';
  const inst: Instance = {
    id: uuid(),
    name,
    dir: uniqueFolder(name, all),
    mcVersion: opts.mcVersion,
    loader: opts.loader,
    loaderVersion: opts.loaderVersion,
    ramMb: opts.ramMb ?? 2048,
    jvmArgs: opts.jvmArgs ?? '',
    javaPath: opts.javaPath,
    createdAt: Date.now()
  };
  all.push(inst);
  saveInstances(all);
  fs.mkdirSync(instanceGameDir(inst.id), { recursive: true });
  return inst;
}

export function updateInstance(id: string, patch: Partial<Instance>): Instance | null {
  const all = listInstances();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const next: Instance = { ...all[idx], ...patch, id, dir: all[idx].dir };
  if (patch.name !== undefined && patch.name !== all[idx].name) {
    next.dir = renameFolder(next, all) ?? next.dir;
  }
  all[idx] = next;
  saveInstances(all);
  return all[idx];
}

export function deleteInstance(id: string): void {
  // Remove the folder FIRST so we don't drop the instance from the list while
  // leaving its files orphaned on disk. Windows often keeps file handles open
  // briefly (antivirus, the game process, Explorer), so retry a few times and
  // surface a clear error instead of silently swallowing it.
  const dir = instanceDir(id);
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
    } catch (err) {
      throw new Error(
        `Nie udało się usunąć folderu instancji — upewnij się, że gra jest zamknięta i spróbuj ponownie.\n${
          (err as Error).message
        }`
      );
    }
  }
  saveInstances(listInstances().filter((i) => i.id !== id));
}

export function getInstance(id: string): Instance | null {
  return listInstances().find((i) => i.id === id) ?? null;
}

/** Duplicate an instance: copy its config and full game folder under a new id. */
export function duplicateInstance(id: string): Instance | null {
  const src = getInstance(id);
  if (!src) return null;
  const all = listInstances();
  const name = `${src.name} (kopia)`;
  const copy: Instance = {
    ...src,
    id: uuid(),
    name,
    dir: uniqueFolder(name, all),
    createdAt: Date.now(),
    lastPlayed: undefined,
    playtimeMs: 0,
    sessions: 0,
    pinned: false
  };
  all.push(copy);
  saveInstances(all);
  fs.mkdirSync(instanceGameDir(copy.id), { recursive: true });
  const srcDir = instanceGameDir(id);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, instanceGameDir(copy.id), { recursive: true });
  }
  // Copy the mods/resourcepacks manifests stored at the instance root.
  for (const f of ['mods.json', 'resourcepacks.json', 'shaderpacks.json']) {
    const p = path.join(instanceDir(id), f);
    if (fs.existsSync(p)) fs.copyFileSync(p, path.join(instanceDir(copy.id), f));
  }
  return copy;
}

/** Game settings files: controls/video (vanilla, OptiFine, shaders) and, optionally, the server list. */
const SETTINGS_FILES = ['options.txt', 'optionsof.txt', 'optionsshaders.txt'];

/** Copy game settings from one instance to another; returns how many files were copied. */
export function copyGameSettings(fromId: string, toId: string, servers: boolean): number {
  if (fromId === toId) return 0;
  const from = instanceGameDir(fromId);
  const to = instanceGameDir(toId);
  fs.mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const name of [...SETTINGS_FILES, ...(servers ? ['servers.dat'] : [])]) {
    const src = path.join(from, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(to, name));
    copied++;
  }
  return copied;
}
