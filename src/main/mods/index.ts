import fs from 'fs';
import path from 'path';
import { instanceDir, instanceGameDir } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { downloadFile } from '../utils/http';
import { getInstance } from '../minecraft/instances';
import * as modrinth from './modrinth';
import * as curseforge from './curseforge';
import type {
  ModProvider,
  ModSearchResult,
  ModFile,
  InstalledMod,
  ContentKind,
  ContentUpdate
} from '../../shared/types';

const DISABLED = '.disabled';

/** Per-kind game-dir folder, manifest file and accepted file extension. */
const FOLDERS: Record<ContentKind, string> = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks'
};
const MANIFESTS: Record<ContentKind, string> = {
  mod: 'mods.json',
  resourcepack: 'resourcepacks.json',
  shader: 'shaderpacks.json'
};
const EXT: Record<ContentKind, RegExp> = {
  mod: /\.jar(\.disabled)?$/i,
  resourcepack: /\.zip(\.disabled)?$/i,
  shader: /\.zip(\.disabled)?$/i
};

/** Metadata we remember about installed files, keyed by base filename. */
type ContentManifest = Record<
  string,
  { provider: ModProvider; projectId: string; fileId: string; title: string }
>;

function manifestPath(instanceId: string, kind: ContentKind): string {
  return path.join(instanceDir(instanceId), MANIFESTS[kind]);
}
function readManifest(instanceId: string, kind: ContentKind): ContentManifest {
  return readJson<ContentManifest>(manifestPath(instanceId, kind), {});
}
function writeManifest(instanceId: string, kind: ContentKind, m: ContentManifest): void {
  writeJson(manifestPath(instanceId, kind), m);
}
function contentDir(instanceId: string, kind: ContentKind): string {
  return path.join(instanceGameDir(instanceId), FOLDERS[kind]);
}
function baseName(fileName: string): string {
  return fileName.endsWith(DISABLED) ? fileName.slice(0, -DISABLED.length) : fileName;
}
/** Loaders only apply to mods; packs/shaders aren't loader-bound. */
function effectiveLoader(kind: ContentKind, loader: string): string {
  return kind === 'mod' ? loader : '';
}

function unsupported(provider: ModProvider): never {
  throw new Error(`Nieznany dostawca: ${provider}`);
}

// ---------- search ----------

export async function searchContent(
  kind: ContentKind,
  provider: ModProvider,
  query: string,
  mcVersion: string,
  loader: string,
  offset = 0,
  category = ''
): Promise<ModSearchResult[]> {
  const l = effectiveLoader(kind, loader);
  // Categories only apply to mods.
  const cat = kind === 'mod' ? category : '';
  if (provider === 'modrinth') return modrinth.search(query, mcVersion, l, offset, 20, kind, cat);
  if (provider === 'curseforge') return curseforge.search(query, mcVersion, l, offset, 20, kind, cat);
  return unsupported(provider);
}

/** Search for modpacks (project_type:modpack). Loader is irrelevant — packs bundle their own. */
export async function searchModpacks(
  provider: ModProvider,
  query: string,
  mcVersion: string,
  offset = 0
): Promise<ModSearchResult[]> {
  if (provider === 'modrinth') return modrinth.search(query, mcVersion, '', offset, 20, 'modpack');
  if (provider === 'curseforge') return curseforge.search(query, mcVersion, '', offset, 20, 'modpack');
  return unsupported(provider);
}

export async function getContentFiles(
  kind: ContentKind,
  provider: ModProvider,
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile[]> {
  const l = effectiveLoader(kind, loader);
  if (provider === 'modrinth') return modrinth.getVersions(projectId, mcVersion, l);
  if (provider === 'curseforge') return curseforge.getVersions(projectId, mcVersion, l);
  return unsupported(provider);
}

async function bestFileFor(
  provider: ModProvider,
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile | null> {
  if (provider === 'modrinth') return modrinth.getBestVersion(projectId, mcVersion, loader);
  if (provider === 'curseforge') return curseforge.getBestVersion(projectId, mcVersion, loader);
  return unsupported(provider);
}

// ---------- install ----------

/**
 * Download a file into the instance's folder for `kind`, recording metadata.
 * For mods, required dependencies are resolved and installed too (when withDeps).
 */
export async function installContent(
  instanceId: string,
  kind: ContentKind,
  file: ModFile,
  withDeps = true
): Promise<InstalledMod[]> {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('Brak instancji.');
  if (!file.url) throw new Error(`Plik "${file.displayName}" nie ma adresu pobierania.`);

  const dir = contentDir(instanceId, kind);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(instanceId, kind);
  const visited = new Set<string>();
  const resolveDeps = kind === 'mod' && withDeps;

  const installOne = async (f: ModFile): Promise<void> => {
    if (visited.has(f.projectId)) return;
    visited.add(f.projectId);

    const dest = path.join(dir, f.fileName);
    if (!fs.existsSync(dest) && !fs.existsSync(dest + DISABLED)) {
      await downloadFile(f.url, dest, f.sha1);
    }
    manifest[baseName(f.fileName)] = {
      provider: f.provider,
      projectId: f.projectId,
      fileId: f.fileId,
      title: f.displayName
    };

    if (resolveDeps) {
      for (const dep of f.dependencies) {
        if (dep.type !== 'required' || !dep.projectId) continue;
        if (visited.has(dep.projectId)) continue;
        try {
          const depFile = await bestFileFor(f.provider, dep.projectId, instance.mcVersion, instance.loader);
          if (depFile) await installOne(depFile);
        } catch {
          /* dependency unavailable for this version — skip silently */
        }
      }
    }
  };

  await installOne(file);
  writeManifest(instanceId, kind, manifest);
  return listInstalledContent(instanceId, kind);
}

/** Copy local files (e.g. drag & dropped jars/zips) into the instance folder. */
export function addLocalContent(
  instanceId: string,
  kind: ContentKind,
  filePaths: string[]
): InstalledMod[] {
  const dir = contentDir(instanceId, kind);
  fs.mkdirSync(dir, { recursive: true });
  for (const src of filePaths) {
    if (!EXT[kind].test(src)) continue;
    try {
      fs.copyFileSync(src, path.join(dir, path.basename(src)));
    } catch {
      /* skip unreadable files */
    }
  }
  return listInstalledContent(instanceId, kind);
}

// ---------- list / toggle / delete ----------

export function listInstalledContent(instanceId: string, kind: ContentKind): InstalledMod[] {
  const dir = contentDir(instanceId, kind);
  if (!fs.existsSync(dir)) return [];
  const manifest = readManifest(instanceId, kind);
  const out: InstalledMod[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!EXT[kind].test(entry)) continue;
    const enabled = !entry.endsWith(DISABLED);
    const base = baseName(entry);
    const meta = manifest[base];
    let size = 0;
    try {
      size = fs.statSync(path.join(dir, entry)).size;
    } catch {
      /* ignore */
    }
    out.push({
      fileName: entry,
      enabled,
      size,
      provider: meta?.provider,
      projectId: meta?.projectId,
      fileId: meta?.fileId,
      title: meta?.title ?? base
    });
  }
  return out.sort((a, b) => (a.title ?? a.fileName).localeCompare(b.title ?? b.fileName));
}

export function toggleContent(
  instanceId: string,
  kind: ContentKind,
  fileName: string,
  enabled: boolean
): InstalledMod[] {
  const dir = contentDir(instanceId, kind);
  const current = path.join(dir, fileName);
  if (!fs.existsSync(current)) throw new Error('Nie znaleziono pliku.');
  const base = baseName(fileName);
  const target = path.join(dir, enabled ? base : base + DISABLED);
  if (current !== target) fs.renameSync(current, target);
  return listInstalledContent(instanceId, kind);
}

export function deleteContent(
  instanceId: string,
  kind: ContentKind,
  fileName: string
): InstalledMod[] {
  const dir = contentDir(instanceId, kind);
  try {
    fs.rmSync(path.join(dir, fileName), { force: true });
  } catch {
    /* ignore */
  }
  const manifest = readManifest(instanceId, kind);
  delete manifest[baseName(fileName)];
  writeManifest(instanceId, kind, manifest);
  return listInstalledContent(instanceId, kind);
}

// ---------- updates ----------

/** Check installed (provider-tracked) items for a newer version at the source. */
export async function checkUpdates(instanceId: string, kind: ContentKind): Promise<ContentUpdate[]> {
  const instance = getInstance(instanceId);
  if (!instance) return [];
  const installed = listInstalledContent(instanceId, kind);
  const loader = effectiveLoader(kind, instance.loader);
  const out: ContentUpdate[] = [];
  await Promise.all(
    installed.map(async (m) => {
      if (!m.provider || !m.projectId || !m.fileId) return;
      try {
        const best = await bestFileFor(m.provider, m.projectId, instance.mcVersion, loader);
        if (best && best.fileId !== m.fileId) {
          out.push({
            fileName: m.fileName,
            title: m.title ?? m.fileName,
            currentFileId: m.fileId,
            newFile: best
          });
        }
      } catch {
        /* provider error / no compatible version — ignore */
      }
    })
  );
  return out;
}

/** Replace an installed item with a newer file, preserving enabled/disabled state. */
export async function updateContent(
  instanceId: string,
  kind: ContentKind,
  fileName: string,
  newFile: ModFile
): Promise<InstalledMod[]> {
  const dir = contentDir(instanceId, kind);
  const wasDisabled = fileName.endsWith(DISABLED);

  await installContent(instanceId, kind, newFile, true);

  // Remove the old file + manifest entry if the filename actually changed.
  if (baseName(fileName) !== baseName(newFile.fileName)) {
    try {
      fs.rmSync(path.join(dir, fileName), { force: true });
    } catch {
      /* ignore */
    }
    const manifest = readManifest(instanceId, kind);
    delete manifest[baseName(fileName)];
    writeManifest(instanceId, kind, manifest);
  }

  // Carry over the disabled state to the freshly installed file.
  if (wasDisabled) {
    const enabledPath = path.join(dir, newFile.fileName);
    if (fs.existsSync(enabledPath)) {
      try {
        fs.renameSync(enabledPath, enabledPath + DISABLED);
      } catch {
        /* ignore */
      }
    }
  }
  return listInstalledContent(instanceId, kind);
}
