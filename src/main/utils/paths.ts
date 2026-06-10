import { app } from 'electron';
import path from 'path';
import fs from 'fs';

const appData = app.getPath('appData');
const dataRoot = path.join(appData, 'ZerdaLauncher');

// Migrate data from the old "JavaLauncher" folder (pre-rename) so existing
// instances, accounts and downloads aren't orphaned.
(() => {
  const legacy = path.join(appData, 'JavaLauncher');
  if (fs.existsSync(legacy) && !fs.existsSync(dataRoot)) {
    try {
      fs.renameSync(legacy, dataRoot);
    } catch {
      /* if rename fails (e.g. cross-device), the app will just start fresh */
    }
  }
})();

export const paths = {
  root: dataRoot,
  instances: path.join(dataRoot, 'instances'),
  servers: path.join(dataRoot, 'servers'),
  versions: path.join(dataRoot, 'versions'),
  libraries: path.join(dataRoot, 'libraries'),
  assets: path.join(dataRoot, 'assets'),
  natives: path.join(dataRoot, 'natives'),
  runtimes: path.join(dataRoot, 'runtimes'),
  cache: path.join(dataRoot, 'cache'),
  config: path.join(dataRoot, 'config.json'),
  accounts: path.join(dataRoot, 'accounts.json'),
  settings: path.join(dataRoot, 'settings.json')
};

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

export function instanceDir(id: string): string {
  return path.join(paths.instances, id);
}

export function instanceGameDir(id: string): string {
  return path.join(instanceDir(id), 'minecraft');
}

export function serverDir(id: string): string {
  return path.join(paths.servers, id);
}
