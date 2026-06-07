import path from 'path';
import fs from 'fs';
import { getJson } from '../utils/http';
import { paths } from '../utils/paths';

const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    time: string;
    releaseTime: string;
    sha1: string;
  }>;
}

export interface DownloadEntry {
  url: string;
  sha1: string;
  size: number;
  path?: string;
}

export interface VersionData {
  id: string;
  mainClass: string;
  type: string;
  assets: string;
  assetIndex: DownloadEntry & { id: string; totalSize: number };
  downloads: { client: DownloadEntry; server?: DownloadEntry };
  libraries: Library[];
  arguments?: { game: ArgumentItem[]; jvm: ArgumentItem[] };
  minecraftArguments?: string;
  javaVersion?: { component: string; majorVersion: number };
  inheritsFrom?: string;
}

export type ArgumentItem = string | { rules?: Rule[]; value: string | string[] };

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; arch?: string; version?: string };
  features?: Record<string, boolean>;
}

export interface Library {
  name: string;
  downloads?: {
    artifact?: DownloadEntry;
    classifiers?: Record<string, DownloadEntry>;
  };
  natives?: Record<string, string>;
  rules?: Rule[];
  url?: string;
  extract?: { exclude?: string[] };
}

export async function fetchVersionManifest(): Promise<VersionManifest> {
  return getJson<VersionManifest>(VERSION_MANIFEST_URL);
}

export async function fetchVersionData(versionId: string): Promise<VersionData> {
  // Locally-installed profiles take priority. Fabric/Forge/NeoForge synthesize
  // their own version ids (e.g. "fabric-loader-0.16.2-1.21", "1.21-forge-51.0.0")
  // that do NOT exist in Mojang's manifest — they only live on disk. Vanilla
  // versions are also cached here after first download.
  const cachePath = path.join(paths.versions, versionId, `${versionId}.json`);
  if (fs.existsSync(cachePath)) {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as VersionData;
  }

  // Otherwise resolve from the Mojang version manifest (vanilla only).
  const manifest = await fetchVersionManifest();
  const entry = manifest.versions.find((v) => v.id === versionId);
  if (!entry) throw new Error(`Unknown Minecraft version: ${versionId}`);

  const data = await getJson<VersionData>(entry.url);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
  return data;
}

export function evaluateRules(rules: Rule[] | undefined): boolean {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    if (matchRule(rule)) allowed = rule.action === 'allow';
  }
  return allowed;
}

function matchRule(rule: Rule): boolean {
  if (rule.os?.name) {
    const osName = osMatch(rule.os.name);
    if (!osName) return false;
  }
  if (rule.os?.arch && rule.os.arch !== process.arch) return false;
  if (rule.features) {
    for (const v of Object.values(rule.features)) if (v) return false;
  }
  return true;
}

function osMatch(name: string): boolean {
  if (name === 'windows') return process.platform === 'win32';
  if (name === 'osx') return process.platform === 'darwin';
  if (name === 'linux') return process.platform === 'linux';
  return false;
}

export function nativesClassifier(): string | null {
  if (process.platform === 'win32') {
    return process.arch === 'arm64' ? 'natives-windows-arm64' : 'natives-windows';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'natives-macos-arm64' : 'natives-macos';
  }
  if (process.platform === 'linux') return 'natives-linux';
  return null;
}

export function libraryArtifactPath(name: string): string {
  const [group, artifact, version, classifier] = parseLibraryName(name);
  const groupPath = group.replace(/\./g, '/');
  const file = classifier
    ? `${artifact}-${version}-${classifier}.jar`
    : `${artifact}-${version}.jar`;
  return `${groupPath}/${artifact}/${version}/${file}`;
}

function parseLibraryName(name: string): [string, string, string, string?] {
  const parts = name.split(':');
  return [parts[0], parts[1], parts[2], parts[3]];
}
