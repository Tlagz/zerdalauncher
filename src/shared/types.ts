import type { Appearance, ThemePreset } from './appearance';

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
  /** Folder name under instances/ (human-readable; older instances used the id). */
  dir?: string;
  /** User-defined group the instance is listed under (empty = ungrouped). */
  group?: string;
  /** Installed from a Sztulagz pack (for updates). */
  pack?: { id: string; version: string };
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
  /** Id of the skin (from the local library) currently set on this account. */
  skinId?: string;
}

/** A skin stored in the launcher's local skin library. */
export interface SkinEntry {
  id: string;
  name: string;
  variant: 'classic' | 'slim';
  addedAt: number;
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
  /** UI theme: 'default' | 'dark' | 'crimson' | 'light'. */
  theme: string;
  /** Personalization (accent, background, motion, layout); missing keys use defaults. */
  appearance?: Partial<Appearance>;
  /** Looks saved by the user on the Personalizacja page. */
  themePresets?: ThemePreset[];
  /** Interface language (default Polish). */
  language?: 'pl' | 'en';
}

/** Mod loader build versions for a given MC version, split into stable/unstable. */
export interface LoaderVersionInfo {
  /** Forge only: officially "recommended" build. */
  recommended?: string;
  latest?: string;
  stable: string[];
  /** Beta/unpromoted/pre-release builds — hidden behind a toggle in the UI. */
  unstable: string[];
}

/** Where heavy game data (instances, libraries, assets…) is stored. */
export interface DataLocationInfo {
  current: string;
  isDefault: boolean;
  defaultDir: string;
  /** A custom location that's no longer reachable (e.g. unplugged drive); the default is in use. */
  unavailable?: string;
}

/** Status of a Mojang-provided Java runtime component (manual downloader in Settings). */
export interface JreStatus {
  component: string;
  javaMajor: number;
  mcRange: string;
  installed: boolean;
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
  /** 'claim' = waiting for the user to link playit.gg in the browser (one-time). */
  state: 'stopped' | 'starting' | 'claim' | 'active' | 'error';
  address?: string;
  message?: string;
  /** How the server is reachable: direct port forward via the router, or the playit.gg relay. */
  method?: 'upnp' | 'playit';
  claimUrl?: string;
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

/** Live resource use of a running game (sampled every ~2 s). */
export interface GameStats {
  instanceId: string;
  /** Memory in use (working set), bytes; 0 once the game has ended. */
  ram: number;
  /** Share of the whole CPU, 0–100. */
  cpu: number;
  /** -Xmx given to the game, MB. */
  maxMb: number;
  ended?: boolean;
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

// --- Crash analysis ---
/** A one-click repair the crash dialog can offer. */
export type CrashFix =
  | { kind: 'ram'; ramMb: number }
  /** Download Mojang's Java N runtime and pin it on the instance. */
  | { kind: 'java'; major: number }
  /** Drop a manually set Java path so the launcher picks the right one. */
  | { kind: 'clearJava' }
  | { kind: 'disableMods'; files: string[] }
  /** Install missing dependencies, by mod id (resolved on Modrinth). */
  | { kind: 'installMods'; modIds: string[] }
  /** Delete a corrupted launcher-managed file so it is downloaded again. */
  | { kind: 'deleteFile'; path: string }
  /** Switch to the newest stable mod loader build. */
  | { kind: 'updateLoader' }
  /** Remove custom JVM arguments the Java version doesn't understand. */
  | { kind: 'clearJvmArgs' }
  /** Open the instance's mod manager (e.g. to update mods). */
  | { kind: 'openMods' };

export interface CrashIssue {
  title: string;
  detail: string;
  fix?: CrashFix;
  fixLabel?: string;
}

export interface CrashReport {
  instanceId: string;
  instanceName: string;
  exitCode: number | null;
  issues: CrashIssue[];
  /** The most telling exception line, when no known cause matched. */
  keyLine?: string;
  crashReportFile?: string;
  /** Last part of the game log, for copying into a bug report. */
  logTail: string;
}

/** A screenshot in an instance's screenshots folder. */
export interface ScreenshotInfo {
  name: string;
  size: number;
  takenAt: number;
}

/** A screenshot together with the instance it belongs to (Screenshots page). */
export interface ScreenshotEntry extends ScreenshotInfo {
  instanceId: string;
  instanceName?: string;
}

/** What to put into an exported pack. */
export interface ExportOptions {
  format: 'zerda' | 'mrpack';
  config: boolean;
  resourcepacks: boolean;
  shaderpacks: boolean;
  options: boolean;
  /** World folder names to include (saves/). */
  worlds: string[];
}

// --- Home news ---
/** A Minecraft: Java Edition release or snapshot from Mojang's patch-notes feed. */
export interface McNewsEntry {
  title: string;
  version: string;
  type: 'release' | 'snapshot';
  date: string;
  shortText: string;
  image?: string;
  contentPath: string;
}

export interface McPatchNotes {
  title: string;
  version: string;
  /** HTML from Mojang — sanitized in the renderer before display. */
  body: string;
  image?: string;
}

/** One finished game session (playlog.json), for weekly stats. */
export interface PlaySession {
  instanceId: string;
  start: number;
  ms: number;
}

/** A server from an instance's auto-join address or in-game server list. */
export interface SavedServer {
  name: string;
  address: string;
  icon?: string;
  /** The most recently played instance that has this server. */
  instanceId: string;
  instanceName: string;
  mcVersion: string;
}

/** Live status from the Server List Ping. */
export interface ServerPing {
  online: boolean;
  latency?: number;
  players?: { online: number; max: number };
  version?: string;
  motd?: string;
  favicon?: string;
  error?: string;
}

/** Full project page shown inside the launcher (Mods → details). */
export interface ProjectDetails {
  provider: ModProvider;
  projectId: string;
  title: string;
  summary: string;
  author?: string;
  iconUrl?: string;
  /** Description as Markdown (Modrinth) or HTML (CurseForge) — sanitized in the renderer. */
  body: string;
  bodyFormat: 'markdown' | 'html';
  gallery: Array<{ url: string; title?: string }>;
  downloads: number;
  followers?: number;
  updated?: string;
  license?: string;
  categories: string[];
  links: Array<{ label: string; url: string }>;
}

/** One entry of a project's changelog (newest versions for the instance). */
export interface ProjectChange {
  name: string;
  date: string;
  type: 'release' | 'beta' | 'alpha';
  changelog: string;
  format: 'markdown' | 'html';
}

// --- Server invites (zerda://join/…) ---
export interface Invite {
  v: 1;
  /** Server display name and address to join. */
  name: string;
  address: string;
  mc: string;
  loader: ModLoader;
  loaderVersion?: string;
  /** Name for the instance the friend gets. */
  pack?: string;
  /** Who sent it (launcher username). */
  from?: string;
  /** Modrinth version ids of the mods to install. */
  mods: string[];
}

export interface InviteCreated {
  link: string;
  modCount: number;
  /** Enabled mods that aren't on Modrinth, so they can't go into the invite. */
  skipped: string[];
}

export interface InvitePreview {
  mods: Array<{ title: string; version: string }>;
  /** Existing instances with the same Minecraft version and loader. */
  matching: string[];
}

// --- World map ---
export type MapDimension = 'overworld' | 'nether' | 'end';

/** Which world to map: a singleplayer save or a hosted server's world. */
export type MapTarget = { kind: 'instance'; instanceId: string; world: string } | { kind: 'server'; serverId: string };

export interface MapInfo {
  /** Opaque id used in tile URLs (zerda-map://tile/<token>/…). */
  token: string;
  name: string;
  /** Region coordinates that exist, per dimension. */
  dims: Partial<Record<MapDimension, Array<[number, number]>>>;
  spawn?: { x: number; z: number };
  player?: { x: number; z: number; dim: MapDimension };
}

// --- Sztulagz packs (curated modpacks published from the launcher) ---
export interface CatalogVersion {
  version: string;
  date: string;
  changelog: string;
  /** .zerda download (GitHub release asset). */
  url: string;
  size: number;
  sha1: string;
  mods: number;
}

export interface CatalogPack {
  id: string;
  name: string;
  description: string;
  icon?: string;
  mcVersion: string;
  loader: ModLoader;
  loaderVersion?: string;
  updated: string;
  /** Newest first. */
  versions: CatalogVersion[];
}

/** Owner publishing: create a pack, release a new version, or only edit its card. */
export interface PublishRequest {
  packId?: string;
  instanceId?: string;
  name: string;
  description: string;
  /** PNG data URL; undefined keeps the current icon. */
  icon?: string;
  version?: string;
  changelog?: string;
}

export interface PublisherStatus {
  isOwner: boolean;
  /** GitHub login of the saved token, when one is set. */
  login?: string;
  repoExists?: boolean;
}
