import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { paths, instanceDir, instanceGameDir, ensureDirs } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import type { Instance, ModLoader } from '../../shared/types';

const FILE = path.join(paths.root, 'instances.json');

export function listInstances(): Instance[] {
  ensureDirs();
  return readJson<Instance[]>(FILE, []);
}

export function saveInstances(items: Instance[]): void {
  writeJson(FILE, items);
}

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
  const inst: Instance = {
    id: uuid(),
    name: opts.name.trim() || 'Nowa instancja',
    mcVersion: opts.mcVersion,
    loader: opts.loader,
    loaderVersion: opts.loaderVersion,
    ramMb: opts.ramMb ?? 2048,
    jvmArgs: opts.jvmArgs ?? '',
    javaPath: opts.javaPath,
    createdAt: Date.now()
  };
  fs.mkdirSync(instanceGameDir(inst.id), { recursive: true });
  const all = listInstances();
  all.push(inst);
  saveInstances(all);
  return inst;
}

export function updateInstance(id: string, patch: Partial<Instance>): Instance | null {
  const all = listInstances();
  const idx = all.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id };
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
  const copy: Instance = {
    ...src,
    id: uuid(),
    name: `${src.name} (kopia)`,
    createdAt: Date.now(),
    lastPlayed: undefined,
    playtimeMs: 0,
    sessions: 0,
    pinned: false
  };
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
  const all = listInstances();
  all.push(copy);
  saveInstances(all);
  return copy;
}
