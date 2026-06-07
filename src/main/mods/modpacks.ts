import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { downloadFile } from '../utils/http';
import { readJson, writeJson } from '../utils/store';
import { paths, instanceDir, instanceGameDir } from '../utils/paths';
import { createInstance } from '../minecraft/instances';
import * as modrinth from './modrinth';
import * as curseforge from './curseforge';
import type { AppSettings, ModLoader, ModProvider, ModFile } from '../../shared/types';

export type PackProgress = (current: number, total: number, msg: string) => void;

const ZERDA_MANIFEST = 'zerda.manifest.json';
const MR_INDEX = 'modrinth.index.json';
const CF_MANIFEST = 'manifest.json';

// ---------- shared helpers ----------

function defaultRam(): number {
  const s = readJson<Partial<AppSettings>>(paths.settings, {});
  return s.defaultRamMb ?? 4096;
}

function baseName(file: string): string {
  return file.endsWith('.disabled') ? file.slice(0, -'.disabled'.length) : file;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T, i: number) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

function extractOverrides(zip: AdmZip, gameDir: string, prefixes: string[]): void {
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    for (const prefix of prefixes) {
      if (e.entryName.startsWith(prefix)) {
        const rel = e.entryName.slice(prefix.length);
        if (!rel) continue;
        const dest = path.join(gameDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, e.getData());
      }
    }
  }
}

// ---------- Modrinth .mrpack ----------

interface MrIndex {
  formatVersion: number;
  name: string;
  versionId?: string;
  dependencies: Record<string, string>;
  files: Array<{
    path: string;
    hashes?: { sha1?: string };
    downloads: string[];
    env?: { client?: string; server?: string };
  }>;
}

function mapMrLoader(deps: Record<string, string>): { loader: ModLoader; loaderVersion?: string } {
  if (deps['fabric-loader']) return { loader: 'fabric', loaderVersion: deps['fabric-loader'] };
  if (deps['neoforge']) return { loader: 'neoforge', loaderVersion: deps['neoforge'] };
  if (deps['forge']) return { loader: 'forge', loaderVersion: deps['forge'] };
  if (deps['quilt-loader']) {
    throw new Error('Ten modpack wymaga Quilt, który nie jest jeszcze obsługiwany.');
  }
  return { loader: 'vanilla' };
}

async function installFromMrpack(zip: AdmZip, name: string, progress: PackProgress): Promise<string> {
  const indexEntry = zip.getEntry(MR_INDEX);
  if (!indexEntry) throw new Error('Nieprawidłowy plik .mrpack (brak modrinth.index.json).');
  const index = JSON.parse(indexEntry.getData().toString('utf8')) as MrIndex;

  const mc = index.dependencies['minecraft'];
  if (!mc) throw new Error('Modpack nie określa wersji Minecraft.');
  const { loader, loaderVersion } = mapMrLoader(index.dependencies);

  const inst = createInstance({
    name: name || index.name,
    mcVersion: mc,
    loader,
    loaderVersion,
    ramMb: defaultRam()
  });
  const gameDir = instanceGameDir(inst.id);

  const wanted = index.files.filter((f) => f.env?.client !== 'unsupported' && f.downloads?.[0]);
  let done = 0;
  await mapLimit(wanted, 8, async (f) => {
    const dest = path.join(gameDir, f.path);
    await downloadFile(f.downloads[0], dest, f.hashes?.sha1);
    progress(++done, wanted.length, f.path);
  });

  extractOverrides(zip, gameDir, ['overrides/', 'client-overrides/']);
  return inst.id;
}

// ---------- ZerdaLauncher .zerda ----------

interface ZerdaFile {
  path: string;
  provider: 'modrinth';
  projectId: string;
  fileId: string;
}
interface ZerdaManifest {
  formatVersion: number;
  generator: string;
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  ramMb: number;
  files: ZerdaFile[];
}
type ModsMeta = Record<string, { provider: string; projectId: string; fileId: string; title: string }>;

async function installFromZerda(zip: AdmZip, name: string, progress: PackProgress): Promise<string> {
  const entry = zip.getEntry(ZERDA_MANIFEST);
  if (!entry) throw new Error('Nieprawidłowy plik .zerda (brak zerda.manifest.json).');
  const manifest = JSON.parse(entry.getData().toString('utf8')) as ZerdaManifest;

  const inst = createInstance({
    name: name || manifest.name,
    mcVersion: manifest.mcVersion,
    loader: manifest.loader,
    loaderVersion: manifest.loaderVersion,
    ramMb: manifest.ramMb || defaultRam()
  });
  const gameDir = instanceGameDir(inst.id);
  const modsMeta: ModsMeta = {};

  let done = 0;
  const files = manifest.files ?? [];
  await mapLimit(files, 8, async (f) => {
    // Re-resolve a fresh download URL from Modrinth via the stored version id.
    const resolved = await modrinth.getVersionById(f.fileId);
    const dest = path.join(gameDir, f.path);
    await downloadFile(resolved.url, dest, resolved.sha1);
    modsMeta[baseName(path.basename(f.path))] = {
      provider: f.provider,
      projectId: f.projectId,
      fileId: f.fileId,
      title: resolved.displayName
    };
    progress(++done, files.length, f.path);
  });

  writeJson(path.join(instanceDir(inst.id), 'mods.json'), modsMeta);
  extractOverrides(zip, gameDir, ['overrides/']);
  return inst.id;
}

// ---------- CurseForge .zip ----------

interface CfPackManifest {
  minecraft: { version: string; modLoaders: Array<{ id: string; primary?: boolean }> };
  manifestType?: string;
  name: string;
  files: Array<{ projectID: number; fileID: number; required?: boolean }>;
  overrides?: string;
}

/** Turn a CurseForge modLoaders id like "forge-47.2.0" into our loader + version. */
function mapCfLoader(
  modLoaders: Array<{ id: string; primary?: boolean }>
): { loader: ModLoader; loaderVersion?: string } {
  const primary = modLoaders.find((m) => m.primary) ?? modLoaders[0];
  if (!primary) return { loader: 'vanilla' };
  const dash = primary.id.indexOf('-');
  const kind = dash >= 0 ? primary.id.slice(0, dash) : primary.id;
  const ver = dash >= 0 ? primary.id.slice(dash + 1) : undefined;
  if (kind === 'forge') return { loader: 'forge', loaderVersion: ver };
  if (kind === 'fabric') return { loader: 'fabric', loaderVersion: ver };
  if (kind === 'neoforge') return { loader: 'neoforge', loaderVersion: ver };
  if (kind === 'quilt') throw new Error('Ten modpack wymaga Quilt, który nie jest jeszcze obsługiwany.');
  return { loader: 'vanilla' };
}

async function installFromCfZip(zip: AdmZip, name: string, progress: PackProgress): Promise<string> {
  const entry = zip.getEntry(CF_MANIFEST);
  if (!entry) throw new Error('Nieprawidłowy modpack CurseForge (brak manifest.json).');
  const manifest = JSON.parse(entry.getData().toString('utf8')) as CfPackManifest;

  const mc = manifest.minecraft?.version;
  if (!mc) throw new Error('Modpack nie określa wersji Minecraft.');
  const { loader, loaderVersion } = mapCfLoader(manifest.minecraft.modLoaders ?? []);

  const inst = createInstance({
    name: name || manifest.name,
    mcVersion: mc,
    loader,
    loaderVersion,
    ramMb: defaultRam()
  });
  const gameDir = instanceGameDir(inst.id);
  const modsMeta: ModsMeta = {};

  // Resolve every {projectID, fileID} pair to a real download URL in one request.
  progress(0, 1, 'Pobieram listę modów…');
  const wanted = manifest.files ?? [];
  const resolved = await curseforge.getFilesByIds(wanted.map((f) => f.fileID));
  const byId = new Map(resolved.map((r) => [r.fileId, r]));

  let done = 0;
  await mapLimit(wanted, 8, async (f) => {
    const r = byId.get(String(f.fileID));
    if (r?.url) {
      try {
        const dest = path.join(gameDir, 'mods', r.fileName);
        await downloadFile(r.url, dest, r.sha1);
        modsMeta[baseName(r.fileName)] = {
          provider: 'curseforge',
          projectId: r.projectId,
          fileId: r.fileId,
          title: r.displayName
        };
      } catch {
        /* a single blocked/removed file shouldn't abort the whole pack */
      }
    }
    progress(++done, wanted.length, r?.fileName ?? `mod ${f.projectID}`);
  });

  writeJson(path.join(instanceDir(inst.id), 'mods.json'), modsMeta);
  const overridesPrefix = (manifest.overrides ?? 'overrides').replace(/\/+$/, '') + '/';
  extractOverrides(zip, gameDir, [overridesPrefix]);
  return inst.id;
}

// ---------- public API ----------

/** Download a resolved CurseForge modpack file and install it as a new instance. */
async function installCfModpackFile(file: ModFile, progress: PackProgress): Promise<string> {
  if (!file.url) throw new Error('Ten plik modpacka nie ma adresu pobierania.');
  const zipPath = path.join(paths.cache, `cfpack-${file.fileId}.zip`);
  await downloadFile(file.url, zipPath, file.sha1);
  return installFromCfZip(new AdmZip(zipPath), file.displayName, progress);
}

/** Download a resolved Modrinth .mrpack file and install it as a new instance. */
async function installMrModpackFile(file: ModFile, progress: PackProgress): Promise<string> {
  if (!file.url) throw new Error('Ten plik modpacka nie ma adresu pobierania.');
  const mrpackPath = path.join(paths.cache, `pack-${file.fileId}.mrpack`);
  await downloadFile(file.url, mrpackPath, file.sha1);
  return installFromMrpack(new AdmZip(mrpackPath), file.displayName, progress);
}

/** List the available versions (files) of a modpack project, newest first. */
export async function getModpackVersions(
  provider: ModProvider,
  projectId: string
): Promise<ModFile[]> {
  if (provider === 'curseforge') return curseforge.getVersions(projectId, '', '');
  return modrinth.getVersions(projectId, '', '');
}

/** Install a specific modpack version (file) chosen by the user. */
export async function installModpackFile(
  provider: ModProvider,
  projectId: string,
  fileId: string,
  progress: PackProgress
): Promise<string> {
  progress(0, 1, 'Pobieram modpack…');
  if (provider === 'curseforge') {
    const file = await curseforge.getFileById(projectId, fileId);
    if (!file) throw new Error('Nie znaleziono wybranej wersji modpacka.');
    return installCfModpackFile(file, progress);
  }
  const file = await modrinth.getVersionById(fileId);
  return installMrModpackFile(file, progress);
}

/** Install the newest version of a CurseForge modpack as a fresh instance. */
export async function installCurseForgeModpack(
  projectId: string,
  progress: PackProgress
): Promise<string> {
  progress(0, 1, 'Pobieram modpack…');
  const file = await curseforge.getLatestFile(projectId);
  if (!file) throw new Error('Nie znaleziono pliku modpacka.');
  return installCfModpackFile(file, progress);
}

/** Install the newest version of a modpack from the given provider. */
export async function installModpack(
  provider: ModProvider,
  projectId: string,
  progress: PackProgress
): Promise<string> {
  if (provider === 'curseforge') return installCurseForgeModpack(projectId, progress);
  return installModrinthModpack(projectId, progress);
}

/** Install the newest version of a Modrinth modpack as a fresh instance. */
export async function installModrinthModpack(projectId: string, progress: PackProgress): Promise<string> {
  progress(0, 1, 'Pobieram modpack…');
  const file = await modrinth.getLatestFile(projectId);
  if (!file) throw new Error('Nie znaleziono pliku modpacka.');
  return installMrModpackFile(file, progress);
}

/** Import a .mrpack or .zerda file from disk. */
export async function importPackFile(filePath: string, progress: PackProgress): Promise<string> {
  const zip = new AdmZip(filePath);
  if (zip.getEntry(MR_INDEX)) return installFromMrpack(zip, '', progress);
  if (zip.getEntry(ZERDA_MANIFEST)) return installFromZerda(zip, '', progress);
  if (zip.getEntry(CF_MANIFEST)) return installFromCfZip(zip, '', progress);
  throw new Error('Nieobsługiwany plik — oczekiwano .mrpack, .zerda lub .zip (CurseForge).');
}

/** Export an instance to ZerdaLauncher's own .zerda format. */
export function exportInstance(instanceId: string, destPath: string): void {
  const all = readJson<Array<{ id: string; name: string; mcVersion: string; loader: ModLoader; loaderVersion?: string; ramMb: number }>>(
    path.join(paths.root, 'instances.json'),
    []
  );
  const inst = all.find((i) => i.id === instanceId);
  if (!inst) throw new Error('Brak instancji.');

  const gameDir = instanceGameDir(instanceId);
  const modsMeta = readJson<ModsMeta>(path.join(instanceDir(instanceId), 'mods.json'), {});
  const zip = new AdmZip();
  const files: ZerdaFile[] = [];

  // Mods: tracked (Modrinth) get referenced for re-download; the rest are bundled.
  const modsFolder = path.join(gameDir, 'mods');
  if (fs.existsSync(modsFolder)) {
    for (const fileName of fs.readdirSync(modsFolder)) {
      if (!/\.jar(\.disabled)?$/i.test(fileName)) continue;
      const meta = modsMeta[baseName(fileName)];
      if (meta?.provider === 'modrinth' && meta.fileId) {
        files.push({
          path: 'mods/' + fileName,
          provider: 'modrinth',
          projectId: meta.projectId,
          fileId: meta.fileId
        });
      } else {
        zip.addLocalFile(path.join(modsFolder, fileName), 'overrides/mods');
      }
    }
  }

  // Bundle common config/world-agnostic settings.
  for (const dir of ['config', 'defaultconfigs', 'scripts', 'kubejs']) {
    const p = path.join(gameDir, dir);
    if (fs.existsSync(p)) zip.addLocalFolder(p, 'overrides/' + dir);
  }
  for (const file of ['options.txt']) {
    const p = path.join(gameDir, file);
    if (fs.existsSync(p)) zip.addLocalFile(p, 'overrides');
  }

  const manifest: ZerdaManifest = {
    formatVersion: 1,
    generator: 'ZerdaLauncher',
    name: inst.name,
    mcVersion: inst.mcVersion,
    loader: inst.loader,
    loaderVersion: inst.loaderVersion,
    ramMb: inst.ramMb,
    files
  };
  zip.addFile(ZERDA_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.writeZip(destPath);
}
