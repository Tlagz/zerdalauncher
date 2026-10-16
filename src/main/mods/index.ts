import fs from 'fs';
import path from 'path';
import { instanceDir, instanceGameDir } from '../utils/paths';
import { readJson, writeJson } from '../utils/store';
import { downloadFile, sha1File } from '../utils/http';
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
  { provider: ModProvider; projectId: string; fileId: string; title: string; iconUrl?: string }
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
  category = '',
  sort = 'relevance'
): Promise<ModSearchResult[]> {
  const l = effectiveLoader(kind, loader);
  // Categories only apply to mods.
  const cat = kind === 'mod' ? category : '';
  if (provider === 'modrinth') return modrinth.search(query, mcVersion, l, offset, 20, kind, cat, sort);
  if (provider === 'curseforge') return curseforge.search(query, mcVersion, l, offset, 20, kind, cat, sort);
  return unsupported(provider);
}

/** Search for modpacks (project_type:modpack). Loader is irrelevant — packs bundle their own. */
export async function searchModpacks(
  provider: ModProvider,
  query: string,
  mcVersion: string,
  offset = 0,
  sort = 'relevance'
): Promise<ModSearchResult[]> {
  if (provider === 'modrinth') return modrinth.search(query, mcVersion, '', offset, 20, 'modpack', '', sort);
  if (provider === 'curseforge') return curseforge.search(query, mcVersion, '', offset, 20, 'modpack', '', sort);
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
  withDeps = true,
  iconUrl?: string
): Promise<InstalledMod[]> {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error('Brak instancji.');
  if (!file.url) throw new Error(`Plik "${file.displayName}" nie ma adresu pobierania.`);

  const dir = contentDir(instanceId, kind);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = readManifest(instanceId, kind);
  const visited = new Set<string>();
  const resolveDeps = kind === 'mod' && withDeps;

  const installOne = async (f: ModFile, icon?: string): Promise<void> => {
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
      title: f.displayName,
      // Icon for the primary file comes from the search result; deps are
      // backfilled lazily by fetchInstalledIcons.
      iconUrl: icon ?? manifest[baseName(f.fileName)]?.iconUrl
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

  await installOne(file, iconUrl);
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
      title: meta?.title ?? base,
      iconUrl: meta?.iconUrl
    });
  }
  return out.sort((a, b) => (a.title ?? a.fileName).localeCompare(b.title ?? b.fileName));
}

/**
 * Backfill icons for provider-tracked items that don't have one cached yet
 * (older installs + auto-resolved dependencies). Results are written to the
 * manifest so this only hits the network once per item.
 */
export async function fetchInstalledIcons(
  instanceId: string,
  kind: ContentKind
): Promise<InstalledMod[]> {
  await identifyContent(instanceId, kind).catch(() => undefined);
  const manifest = readManifest(instanceId, kind);
  const installed = listInstalledContent(instanceId, kind);
  const missing = installed.filter((m) => m.provider && m.projectId && !m.iconUrl);
  if (missing.length === 0) return installed;

  let changed = false;
  await Promise.all(
    missing.map(async (m) => {
      try {
        const icon =
          m.provider === 'curseforge'
            ? await curseforge.getProjectIcon(m.projectId!)
            : await modrinth.getProjectIcon(m.projectId!);
        const entry = manifest[baseName(m.fileName)];
        if (icon && entry) {
          entry.iconUrl = icon;
          changed = true;
        }
      } catch {
        /* provider error — leave without an icon */
      }
    })
  );
  if (changed) writeManifest(instanceId, kind, manifest);
  return listInstalledContent(instanceId, kind);
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

// ---------- identification by hash ----------

// sha1 per file, keyed by path + size + mtime so unchanged files are hashed once.
const hashCache = new Map<string, string>();
// Hashes Modrinth didn't recognise this session (local builds, CurseForge-only mods).
const unknownHashes = new Set<string>();

async function fileSha1(file: string): Promise<string> {
  const st = fs.statSync(file);
  const key = `${file}|${st.size}|${st.mtimeMs}`;
  let h = hashCache.get(key);
  if (!h) {
    h = await sha1File(file);
    hashCache.set(key, h);
  }
  return h;
}

/** sha1 of every installed file of a kind, keyed by its on-disk name. */
export async function installedHashes(instanceId: string, kind: ContentKind): Promise<Map<string, string>> {
  const dir = contentDir(instanceId, kind);
  const out = new Map<string, string>();
  for (const m of listInstalledContent(instanceId, kind)) {
    try {
      out.set(m.fileName, await fileSha1(path.join(dir, m.fileName)));
    } catch {
      /* unreadable — skip */
    }
  }
  return out;
}

/**
 * Recognise files that weren't installed through the launcher (added from disk,
 * unpacked from a modpack) by their hash on Modrinth, so they get a title, an
 * icon and update checks like everything else.
 */
export async function identifyContent(instanceId: string, kind: ContentKind): Promise<void> {
  const manifest = readManifest(instanceId, kind);
  const hashes = await installedHashes(instanceId, kind);
  const untracked = [...hashes].filter(([file, h]) => !manifest[baseName(file)] && !unknownHashes.has(h));
  if (!untracked.length) return;

  const found = await modrinth.versionsByHash(untracked.map(([, h]) => h));
  const projects = await modrinth
    .projectsByIds([...new Set(Object.values(found).map((v) => v.projectId))])
    .catch(() => []);
  const byId = new Map(projects.map((p) => [p.id, p]));
  for (const [file, h] of untracked) {
    const v = found[h];
    if (!v) {
      unknownHashes.add(h);
      continue;
    }
    const p = byId.get(v.projectId);
    manifest[baseName(file)] = {
      provider: 'modrinth',
      projectId: v.projectId,
      fileId: v.fileId,
      title: p?.title ?? v.displayName,
      iconUrl: p?.icon_url
    };
  }
  writeManifest(instanceId, kind, manifest);
}

// ---------- updates ----------

/**
 * Check installed items for a newer compatible version. Modrinth files (also
 * ones recognised by hash) are checked in a single bulk request; CurseForge
 * items one by one.
 */
export async function checkUpdates(instanceId: string, kind: ContentKind): Promise<ContentUpdate[]> {
  const instance = getInstance(instanceId);
  if (!instance) return [];
  await identifyContent(instanceId, kind).catch(() => undefined);
  const installed = listInstalledContent(instanceId, kind);
  const loader = effectiveLoader(kind, instance.loader);
  const out: ContentUpdate[] = [];

  const mr = installed.filter((m) => m.provider === 'modrinth' && m.fileId);
  if (mr.length) {
    const hashes = await installedHashes(instanceId, kind);
    const wanted = mr.map((m) => hashes.get(m.fileName)).filter((h): h is string => !!h);
    try {
      const latest = await modrinth.latestByHash(wanted, loader, instance.mcVersion);
      for (const m of mr) {
        const best = latest[hashes.get(m.fileName) ?? ''];
        if (best && best.fileId !== m.fileId && best.url) {
          out.push({ fileName: m.fileName, title: m.title ?? m.fileName, currentFileId: m.fileId, newFile: best });
        }
      }
    } catch {
      /* Modrinth unreachable — report what CurseForge gives */
    }
  }

  await Promise.all(
    installed.map(async (m) => {
      if (m.provider !== 'curseforge' || !m.projectId || !m.fileId) return;
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
