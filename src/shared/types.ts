export type ModLoader = 'vanilla' | 'fabric' | 'forge' | 'neoforge';

export interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  ramMb: number;
  jvmArgs: string;
  javaPath?: string;
  createdAt: number;
  lastPlayed?: number;
  icon?: string;
  /** Total accumulated playtime in milliseconds. */
  playtimeMs?: number;
  /** Number of times the instance has been launched. */
  sessions?: number;
  /** Optional server address — auto-join on launch via --quickPlayMultiplayer. */
  serverAddress?: string;
  /** Pinned instances sort to the top of the list. */
  pinned?: boolean;
}

export interface Account {
  id: string;
  type: 'microsoft' | 'offline';
  username: string;
  uuid: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  xuid?: string;
}

export interface VersionManifestEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  releaseTime: string;
}

export interface AppSettings {
  defaultRamMb: number;
  javaPath: string;
  closeOnLaunch: boolean;
  /** User-supplied CurseForge Eternal API key (required for CurseForge mods/packs). */
  curseforgeApiKey: string;
  /** Discord application (client) ID for Rich Presence. Empty = disabled. */
  discordClientId: string;
  /** UI theme: 'default' | 'crimson' | 'light'. */
  theme: string;
}

export interface WorldInfo {
  name: string;
  folder: string;
  sizeMb: number;
  lastPlayed?: number;
}

// --- Servers ---
export type ServerLoader = 'vanilla' | 'fabric' | 'forge' | 'neoforge';

export interface ServerInstance {
  id: string;
  name: string;
  mcVersion: string;
  loader: ServerLoader;
  loaderVersion?: string;
  ramMb: number;
  port: number;
  createdAt: number;
  jarReady: boolean;
}

export interface ServerStatus {
  id: string;
  state: 'stopped' | 'starting' | 'running' | 'error';
  message?: string;
}

export interface TunnelStatus {
  id: string;
  state: 'stopped' | 'starting' | 'active' | 'error';
  address?: string;
  message?: string;
}

export interface DownloadProgress {
  instanceId: string;
  phase: string;
  current: number;
  total: number;
  message?: string;
}

export interface LaunchStatus {
  instanceId: string;
  state: 'preparing' | 'downloading' | 'launching' | 'running' | 'stopped' | 'error';
  message?: string;
}

/** Launcher self-update lifecycle (electron-updater). */
export type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'none'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }
  | { state: 'disabled' };

// --- Mods (Modrinth + CurseForge) ---
export type ModProvider = 'modrinth' | 'curseforge';

/** Installable content kinds, each with its own game-dir folder. */
export type ContentKind = 'mod' | 'resourcepack' | 'shader';

export interface ModSearchResult {
  provider: ModProvider;
  projectId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  downloads: number;
  iconUrl?: string;
  categories: string[];
}

export interface ModDependency {
  projectId?: string;
  versionId?: string;
  type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModFile {
  provider: ModProvider;
  fileId: string;
  projectId: string;
  fileName: string;
  displayName: string;
  url: string;
  sha1?: string;
  size?: number;
  gameVersions: string[];
  loaders: string[];
  releaseType: 'release' | 'beta' | 'alpha';
  datePublished: string;
  dependencies: ModDependency[];
}

export interface InstalledMod {
  fileName: string;
  enabled: boolean;
  size: number;
  provider?: ModProvider;
  projectId?: string;
  fileId?: string;
  title?: string;
  iconUrl?: string;
}

/** A pending update for an installed item (newer file found at the provider). */
export interface ContentUpdate {
  fileName: string;
  title: string;
  currentFileId?: string;
  newFile: ModFile;
}
