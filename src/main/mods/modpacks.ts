import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { downloadFile } from '../utils/http';
import { readJson, writeJson } from '../utils/store';
import { paths, instanceDir, instanceGameDir } from '../utils/paths';
import { createInstance, getInstance } from '../minecraft/instances';
import { identifyContent, installedHashes } from './index';
import { latestLoaderVersion } from '../modloaders/latest';
import * as modrinth from './modrinth';
import * as curseforge from './curseforge';
import type { AppSettings, ModLoader, ModProvider, ModFile, ContentKind, ExportOptions } from '../../shared/types';

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

/** Join a pack-supplied relative path onto the game folder, refusing anything that escapes it. */
function safeJoin(gameDir: string, rel: string): string {
  const dest = path.resolve(gameDir, rel);
  if (dest !== path.resolve(gameDir) && !dest.startsWith(path.resolve(gameDir) + path.sep)) {
    throw new Error(`Paczka zawiera niedozwoloną ścieżkę: ${rel}`);
  }
  return dest;
}

function extractOverrides(zip: AdmZip, gameDir: string, prefixes: string[]): void {
  for (const e of zip.getEntries()) {
    if (e.isDirectory) continue;
    for (const prefix of prefixes) {
      if (e.entryName.startsWith(prefix)) {
        const rel = e.entryName.slice(prefix.length);
        if (!rel) continue;
        const dest = safeJoin(gameDir, rel);
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
    hashes?: { sha1?: string; sha512?: string };
    downloads: string[];
    fileSize?: number;
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
    const dest = safeJoin(gameDir, f.path);
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
    const dest = safeJoin(gameDir, f.path);
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

const PACK_DIRS: Array<{ dir: string; kind: ContentKind; ext: RegExp; opt?: keyof ExportOptions }> = [
  { dir: 'mods', kind: 'mod', ext: /.jar(.disabled)?$/i },
  { dir: 'resourcepacks', kind: 'resourcepack', ext: /.zip(.disabled)?$/i, opt: 'resourcepacks' },
  { dir: 'shaderpacks', kind: 'shader', ext: /.zip(.disabled)?$/i, opt: 'shaderpacks' }
];
const MR_LOADER_KEY: Record<string, string> = { fabric: 'fabric-loader', forge: 'forge', neoforge: 'neoforge' };

function sha512File(file: string): string {
  return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Export an instance as a ZerdaLauncher .zerda or a standard Modrinth .mrpack
 * (opens in Modrinth App, Prism, ATLauncher…). Files known to Modrinth are
 * referenced by download link; everything else is bundled under overrides/.
 */
export async function exportInstance(
  instanceId: string,
  destPath: string,
  opts: ExportOptions,
  progress: PackProgress
): Promise<void> {
  const inst = getInstance(instanceId);
  if (!inst) throw new Error('Brak instancji.');
  // Never launched yet: no loader build stored — packs must name one, or they import as vanilla.
  const loaderVersion =
    inst.loaderVersion ?? (inst.loader === 'vanilla' ? undefined : await latestLoaderVersion(inst.loader, inst.mcVersion));
  if (inst.loader !== 'vanilla' && !loaderVersion) {
    throw new Error(`Nie udało się ustalić wersji ${inst.loader} — uruchom instancję raz i spróbuj ponownie.`);
  }
  const gameDir = instanceGameDir(instanceId);
  const zip = new AdmZip();
  const zerdaFiles: ZerdaFile[] = [];
  const mrFiles: MrIndex['files'] = [];

  const dirs = PACK_DIRS.filter((d) => !d.opt || opts[d.opt]);
  let step = 0;
  for (const d of dirs) {
    progress(++step, dirs.length + 2, `Rozpoznaję ${d.dir}…`);
    await identifyContent(instanceId, d.kind).catch(() => undefined);
    const folder = path.join(gameDir, d.dir);
    if (!fs.existsSync(folder)) continue;
    const hashes = await installedHashes(instanceId, d.kind);
    const known = await modrinth.versionsByHash([...hashes.values()]).catch(() => ({}) as Record<string, ModFile>);

    for (const fileName of fs.readdirSync(folder)) {
      if (!d.ext.test(fileName)) continue;
      const full = path.join(folder, fileName);
      const sha1 = hashes.get(fileName);
      const v = sha1 ? known[sha1] : undefined;
      // Disabled files and files we can't link to (or whose link is another file of the version) are bundled.
      const linkable = v && v.url && v.sha1 === sha1 && !fileName.endsWith('.disabled');
      if (!linkable) {
        zip.addLocalFile(full, `overrides/${d.dir}`);
        continue;
      }
      const rel = `${d.dir}/${fileName}`;
      if (opts.format === 'zerda') {
        zerdaFiles.push({ path: rel, provider: 'modrinth', projectId: v.projectId, fileId: v.fileId });
      } else {
        mrFiles.push({
          path: rel,
          hashes: { sha1: sha1!, sha512: sha512File(full) },
          downloads: [v.url],
          fileSize: fs.statSync(full).size,
          ...(d.kind === 'mod' ? {} : { env: { client: 'required', server: 'unsupported' } })
        });
      }
    }
  }

  progress(++step, dirs.length + 2, 'Pakuję ustawienia i światy…');
  if (opts.config) {
    for (const dir of ['config', 'defaultconfigs', 'scripts', 'kubejs']) {
      const p = path.join(gameDir, dir);
      if (fs.existsSync(p)) zip.addLocalFolder(p, 'overrides/' + dir);
    }
  }
  if (opts.options) {
    for (const file of ['options.txt', 'optionsof.txt', 'optionsshaders.txt', 'servers.dat']) {
      const p = path.join(gameDir, file);
      if (fs.existsSync(p)) zip.addLocalFile(p, 'overrides');
    }
  }
  for (const world of opts.worlds) {
    const p = path.join(gameDir, 'saves', world);
    if (world && !world.includes('..') && fs.existsSync(p)) zip.addLocalFolder(p, `overrides/saves/${world}`);
  }

  if (opts.format === 'zerda') {
    const manifest: ZerdaManifest = {
      formatVersion: 1,
      generator: 'ZerdaLauncher',
      name: inst.name,
      mcVersion: inst.mcVersion,
      loader: inst.loader,
      loaderVersion,
      ramMb: inst.ramMb,
      files: zerdaFiles
    };
    zip.addFile(ZERDA_MANIFEST, Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  } else {
    const dependencies: Record<string, string> = { minecraft: inst.mcVersion };
    const key = MR_LOADER_KEY[inst.loader];
    if (key && loaderVersion) dependencies[key] = loaderVersion;
    const index = { formatVersion: 1, game: 'minecraft', versionId: '1.0.0', name: inst.name, files: mrFiles, dependencies };
    zip.addFile(MR_INDEX, Buffer.from(JSON.stringify(index, null, 2), 'utf8'));
  }
  progress(dirs.length + 2, dirs.length + 2, 'Zapisuję plik…');
  await zip.writeZipPromise(destPath);
}
