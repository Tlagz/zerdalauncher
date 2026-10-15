import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const appData = app.getPath('appData');

/**
 * Small, always-local launcher state (accounts, settings, instance/server lists,
 * skins) lives in the config root. Heavy game data (instances, libraries,
 * assets, versions, runtimes…) lives in the data root, which the user can move
 * elsewhere from Settings — the choice is remembered in location.json.
 */
// ZERDA_HOME points the whole launcher at another folder (testing / portable use).
const configRoot = process.env.ZERDA_HOME || path.join(appData, 'ZerdaLauncher');
const LOCATION_FILE = path.join(configRoot, 'location.json');

// Migrate data from the old "JavaLauncher" folder (pre-rename) so existing
// instances, accounts and downloads aren't orphaned.
(() => {
  const legacy = path.join(appData, 'JavaLauncher');
  if (fs.existsSync(legacy) && !fs.existsSync(configRoot)) {
    try {
      fs.renameSync(legacy, configRoot);
    } catch {
      /* if rename fails (e.g. cross-device), the app will just start fresh */
    }
  }
})();

/** Data root from location.json; falls back to the config root if unset or unreachable. */
function resolveDataRoot(): { dir: string; unavailable?: string } {
  try {
    const { dataRoot } = JSON.parse(fs.readFileSync(LOCATION_FILE, 'utf8')) as { dataRoot?: string };
    if (dataRoot) {
      if (fs.existsSync(dataRoot)) return { dir: dataRoot };
      return { dir: configRoot, unavailable: dataRoot };
    }
  } catch {
    /* no custom location */
  }
  return { dir: configRoot };
}

const data = resolveDataRoot();

export const paths = {
  root: configRoot,
  locationFile: LOCATION_FILE,
  data: data.dir,
  /** Set when location.json points at a folder that no longer exists (e.g. unplugged drive). */
  dataUnavailable: data.unavailable,
  instances: path.join(data.dir, 'instances'),
  servers: path.join(data.dir, 'servers'),
  versions: path.join(data.dir, 'versions'),
  libraries: path.join(data.dir, 'libraries'),
  assets: path.join(data.dir, 'assets'),
  natives: path.join(data.dir, 'natives'),
  runtimes: path.join(data.dir, 'runtimes'),
  cache: path.join(data.dir, 'cache'),
  config: path.join(configRoot, 'config.json'),
  accounts: path.join(configRoot, 'accounts.json'),
  settings: path.join(configRoot, 'settings.json')
};

/** Data-root subfolders that move together when the user relocates game data. */
export const MOVABLE_DATA_DIRS = ['instances', 'servers', 'versions', 'libraries', 'assets', 'natives', 'runtimes', 'cache'];

export function ensureDirs(): void {
  for (const dir of [
    paths.root,
    paths.instances,
    paths.servers,
    paths.versions,
    paths.libraries,
    paths.assets,
    path.join(paths.assets, 'indexes'),
    path.join(paths.assets, 'objects'),
    paths.natives,
    paths.runtimes,
    paths.cache
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Instance folders are named after the instance (see minecraft/instances.ts);
// the mapping id -> folder is registered from there to avoid an import cycle.
let instanceFolder: (id: string) => string = (id) => id;
export function setInstanceFolderResolver(resolve: (id: string) => string): void {
  instanceFolder = resolve;
}

export function instanceDir(id: string): string {
  return path.join(paths.instances, instanceFolder(id));
}

export function instanceGameDir(id: string): string {
  return path.join(instanceDir(id), 'minecraft');
}

export function serverDir(id: string): string {
  return path.join(paths.servers, id);
}
