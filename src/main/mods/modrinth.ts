import { getJson, postJson } from '../utils/http';
import type { ModSearchResult, ModFile, ModDependency } from '../../shared/types';

const API = 'https://api.modrinth.com/v2';
const UA = 'ZerdaLauncher/0.1.0 (custom Minecraft launcher)';
const headers = { 'User-Agent': UA };

/** Map our instance loader to the Modrinth facet/loader value. */
function loaderFacet(loader: string): string | null {
  if (loader === 'fabric') return 'fabric';
  if (loader === 'forge') return 'forge';
  if (loader === 'quilt') return 'quilt';
  if (loader === 'neoforge') return 'neoforge';
  return null; // vanilla — no loader filter
}

interface SearchResponse {
  hits: Array<{
    project_id: string;
    slug: string;
    title: string;
    description: string;
    author: string;
    downloads: number;
    icon_url?: string;
    categories: string[];
  }>;
  total_hits: number;
}

interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
    size?: number;
    hashes?: { sha1?: string };
  }>;
  dependencies: Array<{
    project_id?: string | null;
    version_id?: string | null;
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
  }>;
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
  const facets: string[][] = [[`project_type:${projectType}`]];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  // Loader filtering only makes sense for mods; packs/shaders aren't loader-bound.
  const lf = projectType === 'mod' ? loaderFacet(loader) : null;
  if (lf) facets.push([`categories:${lf}`]);
  if (category) facets.push([`categories:${category}`]);

  const index = sort === 'downloads' ? 'downloads' : sort === 'updated' ? 'updated' : 'relevance';
  const params = new URLSearchParams({
    query,
    limit: String(limit),
    offset: String(offset),
    index,
    facets: JSON.stringify(facets)
  });
  const data = await getJson<SearchResponse>(`${API}/search?${params}`, headers);
  return data.hits.map((h) => ({
    provider: 'modrinth' as const,
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    author: h.author,
    downloads: h.downloads,
    iconUrl: h.icon_url,
    categories: h.categories
  }));
}

function toModFile(v: ModrinthVersion): ModFile {
  const file = v.files.find((f) => f.primary) ?? v.files[0];
  return {
    provider: 'modrinth',
    fileId: v.id,
    projectId: v.project_id,
    fileName: file?.filename ?? `${v.version_number}.jar`,
    displayName: v.name || v.version_number,
    url: file?.url ?? '',
    sha1: file?.hashes?.sha1,
    size: file?.size,
    gameVersions: v.game_versions,
    loaders: v.loaders,
    releaseType: v.version_type,
    datePublished: v.date_published,
    dependencies: v.dependencies
      .filter((d) => d.project_id || d.version_id)
      .map<ModDependency>((d) => ({
        projectId: d.project_id ?? undefined,
        versionId: d.version_id ?? undefined,
        type: d.dependency_type
      }))
  };
}

export async function getVersions(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile[]> {
  const params = new URLSearchParams();
  if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
  const lf = loaderFacet(loader);
  if (lf) params.set('loaders', JSON.stringify([lf]));
  const versions = await getJson<ModrinthVersion[]>(
    `${API}/project/${projectId}/version?${params}`,
    headers
  );
  return versions.map(toModFile);
}

/** Best (newest compatible) file for a project — used for dependency resolution. */
export async function getBestVersion(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModFile | null> {
  const files = await getVersions(projectId, mcVersion, loader);
  return files[0] ?? null;
}

export async function getVersionById(versionId: string): Promise<ModFile> {
  const v = await getJson<ModrinthVersion>(`${API}/version/${versionId}`, headers);
  return toModFile(v);
}

/** Project icon URL by id/slug (used to enrich the installed list). */
export async function getProjectIcon(projectId: string): Promise<string | null> {
  const p = await getJson<{ icon_url?: string }>(`${API}/project/${projectId}`, headers);
  return p.icon_url || null;
}

// ---------- hash lookups (identify files that weren't installed through the launcher) ----------

/** The Modrinth version each file (by sha1) belongs to; unknown files are left out. */
export async function versionsByHash(sha1s: string[]): Promise<Record<string, ModFile>> {
  if (!sha1s.length) return {};
  const res = await postJson<Record<string, ModrinthVersion>>(`${API}/version_files`, { hashes: sha1s, algorithm: 'sha1' }, headers);
  return Object.fromEntries(Object.entries(res).map(([h, v]) => [h, toModFile(v)]));
}

/** Newest compatible version for each file (by sha1) in one request. */
export async function latestByHash(sha1s: string[], loader: string, mcVersion: string): Promise<Record<string, ModFile>> {
  if (!sha1s.length) return {};
  const body: Record<string, unknown> = { hashes: sha1s, algorithm: 'sha1', game_versions: [mcVersion] };
  const lf = loaderFacet(loader);
  if (lf) body.loaders = [lf];
  const res = await postJson<Record<string, ModrinthVersion>>(`${API}/version_files/update`, body, headers);
  return Object.fromEntries(Object.entries(res).map(([h, v]) => [h, toModFile(v)]));
}

/** Titles and icons for many projects at once. */
export async function projectsByIds(ids: string[]): Promise<Array<{ id: string; title: string; icon_url?: string }>> {
  if (!ids.length) return [];
  return getJson(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, headers);
}

/** Mod ids whose Modrinth slug differs from the id the loader reports. */
const SLUG_FOR_ID: Record<string, string> = {
  fabric: 'fabric-api',
  'fabric-api': 'fabric-api',
  'fabric-api-base': 'fabric-api',
  architectury: 'architectury-api',
  cloth_config: 'cloth-config',
  'cloth-config2': 'cloth-config',
  kotlinforforge: 'kotlin-for-forge',
  owo: 'owo-lib',
  yet_another_config_lib_v3: 'yacl',
  yet_another_config_lib: 'yacl',
  geckolib3: 'geckolib',
  playeranimator: 'playeranimator',
  forgeconfigapiport: 'forge-config-api-port',
  puzzleslib: 'puzzles-lib',
  resourcefullib: 'resourceful-lib',
  creativecore: 'creativecore',
  bookshelf: 'bookshelf-lib',
  curios: 'curios',
  trinkets: 'trinkets',
  jei: 'jei',
  terrablender: 'terrablender'
};

/** Find the Modrinth project for a mod id reported by the loader (e.g. a missing dependency). */
export async function projectForModId(modId: string, mcVersion: string, loader: string): Promise<string | null> {
  const candidates = [SLUG_FOR_ID[modId], modId, modId.replace(/_/g, '-')].filter((c): c is string => !!c);
  for (const slug of new Set(candidates)) {
    try {
      const p = await getJson<{ id: string; project_type: string }>(`${API}/project/${encodeURIComponent(slug)}`, headers);
      if (p.project_type === 'mod') return p.id;
    } catch {
      /* no project with that slug */
    }
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hits = await search(modId, mcVersion, loader, 0, 5);
  return hits.find((h) => norm(h.slug) === norm(modId) || norm(h.title) === norm(modId))?.projectId ?? null;
}

/** Newest version file of a project, regardless of loader/MC (used for modpacks). */
export async function getLatestFile(projectId: string): Promise<ModFile | null> {
  const versions = await getJson<ModrinthVersion[]>(`${API}/project/${projectId}/version`, headers);
  return versions[0] ? toModFile(versions[0]) : null;
}
