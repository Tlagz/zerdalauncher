import { getJson, postJson } from '../utils/http';
import { readJson } from '../utils/store';
import { paths } from '../utils/paths';
import type { AppSettings, ModSearchResult, ModFile, ModDependency } from '../../shared/types';

const API = 'https://api.curseforge.com/v1';
const GAME_ID = 432; // Minecraft
const CLASS_BY_TYPE: Record<string, number> = {
  mod: 6,
  modpack: 4471,
  resourcepack: 12,
  shader: 6552
};

// Map our shared category keys (Modrinth slugs) to CurseForge mod category IDs.
const CF_CATEGORY_BY_KEY: Record<string, number> = {
  technology: 412,
  magic: 419,
  adventure: 422,
  optimization: 6814, // Performance
  utility: 5191, // Utility & QoL
  decoration: 424, // Cosmetic
  food: 436,
  storage: 420,
  worldgen: 406,
  mobs: 411,
  equipment: 434, // Armor, Tools, and Weapons
  library: 421, // API and Library
  transportation: 415 // Energy, Fluid, and Item Transport
};

// Injected at build time from the CF_API_KEY env var (see electron.vite.config.ts).
// NOT stored in source — keeps the key out of the public repo. Empty in plain dev
// builds, where settings.json provides the key instead.
declare const __CF_API_KEY__: string;

/** Resolve the CurseForge API key: settings.json override, else the build-time key. */
function apiKey(): string {
  const s = readJson<Partial<AppSettings>>(paths.settings, {});
  const key = (s.curseforgeApiKey ?? '').trim() || __CF_API_KEY__ || '';
  if (!key) {
    throw new Error(
      'Brak klucza API CurseForge. Ustaw curseforgeApiKey w settings.json albo zbuduj z CF_API_KEY.'
    );
  }
  return key;
}
function headers(): Record<string, string> {
  return { 'x-api-key': apiKey(), Accept: 'application/json' };
}

/** Map our instance loader to CurseForge's modLoaderType enum. */
function loaderType(loader: string): number | null {
  switch (loader) {
    case 'forge':
      return 1;
    case 'fabric':
      return 4;
    case 'quilt':
      return 5;
    case 'neoforge':
      return 6;
    default:
      return null; // vanilla — no filter
  }
}

interface CfMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  logo?: { url?: string } | null;
  authors?: Array<{ name: string }>;
  categories?: Array<{ name: string }>;
}
interface CfFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  fileLength?: number;
  releaseType: number; // 1 = release, 2 = beta, 3 = alpha
  fileDate: string;
  gameVersions?: string[];
  hashes?: Array<{ value: string; algo: number }>; // algo 1 = sha1, 2 = md5
  dependencies?: Array<{ modId: number; relationType: number }>;
}

function toSearchResult(m: CfMod): ModSearchResult {
  return {
    provider: 'curseforge',
    projectId: String(m.id),
    slug: m.slug,
    title: m.name,
    description: m.summary,
    author: m.authors?.[0]?.name ?? 'CurseForge',
    downloads: m.downloadCount ?? 0,
    iconUrl: m.logo?.url,
    categories: (m.categories ?? []).map((c) => c.name)
  };
}

/**
 * CurseForge omits downloadUrl for files whose author disabled third-party
 * distribution. The public CDN still serves them at a path derived from the id.
 */
function cdnFallback(fileId: number, fileName: string): string {
  const a = Math.floor(fileId / 1000);
  const b = fileId % 1000;
  return `https://edge.forgecdn.net/files/${a}/${b}/${encodeURIComponent(fileName)}`;
}

function toModFile(f: CfFile): ModFile {
  const sha1 = f.hashes?.find((h) => h.algo === 1)?.value;
  return {
    provider: 'curseforge',
    fileId: String(f.id),
    projectId: String(f.modId),
    fileName: f.fileName,
    displayName: f.displayName || f.fileName,
    url: f.downloadUrl ?? cdnFallback(f.id, f.fileName),
    sha1,
    size: f.fileLength,
    gameVersions: f.gameVersions ?? [],
    loaders: [],
    releaseType: f.releaseType === 1 ? 'release' : f.releaseType === 2 ? 'beta' : 'alpha',
    datePublished: f.fileDate,
    dependencies: (f.dependencies ?? [])
      .filter((d) => d.relationType === 3) // 3 = RequiredDependency
      .map<ModDependency>((d) => ({ projectId: String(d.modId), type: 'required' }))
  };
}

export async function search(
  query: string,
  mcVersion: string,
  loader: string,
  offset = 0,
  limit = 20,
  projectType: 'mod' | 'modpack' | 'resourcepack' | 'shader' = 'mod',
  category = '',
  sort = 'relevance'
): Promise<ModSearchResult[]> {
  // CF sortField: 2=Popularity, 3=LastUpdated, 6=TotalDownloads.
  const sortField = sort === 'downloads' ? '6' : sort === 'updated' ? '3' : '2';
  const params = new URLSearchParams({
    gameId: String(GAME_ID),
    classId: String(CLASS_BY_TYPE[projectType] ?? CLASS_BY_TYPE.mod),
    searchFilter: query,
    sortField,
    sortOrder: 'desc',
    index: String(offset),
    pageSize: String(limit)
  });
  if (mcVersion) params.set('gameVersion', mcVersion);
  const lt = projectType === 'mod' ? loaderType(loader) : null;
  if (lt != null) params.set('modLoaderType', String(lt));
  const catId = projectType === 'mod' && category ? CF_CATEGORY_BY_KEY[category] : undefined;
  if (catId) params.set('categoryId', String(catId));

  const data = await getJson<{ data: CfMod[] }>(`${API}/mods/search?${params}`, headers());
  return data.data.map(toSearchResult);
}

export async function getVersions(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile[]> {
  const params = new URLSearchParams({ pageSize: '50' });
  if (mcVersion) params.set('gameVersion', mcVersion);
  const lt = loaderType(loader);
  if (lt != null) params.set('modLoaderType', String(lt));
  const data = await getJson<{ data: CfFile[] }>(
    `${API}/mods/${projectId}/files?${params}`,
    headers()
  );
  return data.data
    .map(toModFile)
    .sort((a, b) => +new Date(b.datePublished) - +new Date(a.datePublished));
}

/** Best (newest compatible) file — used for dependency resolution. */
export async function getBestVersion(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile | null> {
  const files = await getVersions(projectId, mcVersion, loader);
  return files[0] ?? null;
}

/** Resolve a single file by mod id + file id (used to install a chosen modpack version). */
export async function getFileById(modId: string, fileId: string): Promise<ModFile | null> {
  const data = await getJson<{ data: CfFile }>(
    `${API}/mods/${modId}/files/${fileId}`,
    headers()
  );
  return data.data ? toModFile(data.data) : null;
}

/** Resolve specific file ids in bulk (used when installing a CurseForge modpack). */
export async function getFilesByIds(fileIds: number[]): Promise<ModFile[]> {
  if (fileIds.length === 0) return [];
  const data = await postJson<{ data: CfFile[] }>(`${API}/mods/files`, { fileIds }, headers());
  return data.data.map(toModFile);
}

/** Newest file of a project regardless of loader/MC (used to download a modpack). */
export async function getLatestFile(projectId: string): Promise<ModFile | null> {
  const data = await getJson<{ data: CfFile[] }>(
    `${API}/mods/${projectId}/files?pageSize=1`,
    headers()
  );
  return data.data[0] ? toModFile(data.data[0]) : null;
}
