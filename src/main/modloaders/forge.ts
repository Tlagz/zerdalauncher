import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import { libraryArtifactPath } from '../minecraft/manifest';
import { getJson, getText, downloadFile } from '../utils/http';
import { paths } from '../utils/paths';
import { detectJava } from '../utils/java';
import { runServerInstaller } from './serverInstaller';
import type { LoaderVersionInfo } from '../../shared/types';

const FORGE_PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const FORGE_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const FORGE_INSTALLER = (full: string) =>
  `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;

interface ForgePromotions {
  promos: Record<string, string>;
}

function compareForgeBuild(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Every Forge build id (with the `<mcVersion>-` prefix stripped) for one MC version. */
async function forgeBuildList(mcVersion: string): Promise<string[]> {
  const metadata = await getText(FORGE_METADATA);
  const prefix = `${mcVersion}-`;
  return Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g))
    .map((m) => m[1])
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length));
}

/**
 * promotions_slim.json only gives the bare build number (e.g. "10.13.4.1614"),
 * but legacy MC versions (1.7.10 and earlier) publish it under a branch-suffixed
 * maven id (e.g. "10.13.4.1614-1.7.10") — resolve against the real build list so
 * we never hand the installer an id that doesn't actually exist. Also self-heals
 * instances whose `loaderVersion` was saved back when this used the bare id.
 */
async function resolveForgeBuild(mcVersion: string, build: string): Promise<string> {
  const builds = await forgeBuildList(mcVersion);
  if (builds.includes(build)) return build;
  return builds.find((b) => b.startsWith(`${build}-`)) ?? build;
}

/**
 * Every Forge build ever published, not just the "recommended"/"latest" ones
 * promoted on the website — lets users pick unstable/beta builds too.
 */
export async function forgeVersionsFor(mcVersion: string): Promise<LoaderVersionInfo> {
  const [promotions, allBuilds] = await Promise.all([
    getJson<ForgePromotions>(FORGE_PROMOTIONS),
    forgeBuildList(mcVersion)
  ]);

  const resolveBuild = (promoBuild?: string): string | undefined => {
    if (!promoBuild) return undefined;
    if (allBuilds.includes(promoBuild)) return promoBuild;
    return allBuilds.find((b) => b.startsWith(`${promoBuild}-`)) ?? promoBuild;
  };
  const recommended = resolveBuild(promotions.promos[`${mcVersion}-recommended`]);
  const latest = resolveBuild(promotions.promos[`${mcVersion}-latest`]);

  const sorted = allBuilds.slice().sort(compareForgeBuild).reverse();
  const promoted = new Set([recommended, latest].filter(Boolean) as string[]);
  const stable = [recommended, latest].filter(Boolean) as string[];
  const unstable = sorted.filter((v) => !promoted.has(v));

  return { recommended, latest, stable, unstable };
}

/**
 * Forge has a complex install pipeline. The simplest reliable path is to run
 * the official forge-<mc>-<forge>-installer.jar in headless mode against our
 * launcher's data root. This writes a versions/<id>/<id>.json that we can then
 * resolve through the regular pipeline (inheritsFrom -> vanilla).
 */
export async function installForge(mcVersion: string, forgeVersion: string): Promise<string> {
  // Already installed? Skip the (slow) installer entirely.
  const existing = findInstalledForge(mcVersion, forgeVersion);
  if (existing) return existing;

  const resolvedBuild = await resolveForgeBuild(mcVersion, forgeVersion);
  const fullVersion = `${mcVersion}-${resolvedBuild}`;
  const installerPath = path.join(paths.cache, `forge-${fullVersion}-installer.jar`);
  await downloadFile(FORGE_INSTALLER(fullVersion), installerPath);

  const java = detectJava();

  // We need a .minecraft-like directory with launcher_profiles.json for the installer
  const fakeRoot = path.join(paths.cache, 'forge-install-root');
  fs.mkdirSync(fakeRoot, { recursive: true });
  const profiles = path.join(fakeRoot, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) {
    fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '' }));
  }

  const run = java ? await runForgeInstaller(java, installerPath, fakeRoot) : null;
  if (!run || run.code !== 0) {
    // Old installers (e.g. 1.7.10) have no headless client mode ("--installClient is
    // not a recognized option"), so do by hand what they would have done.
    const legacyId = installForgeLegacy(installerPath);
    if (legacyId) return legacyId;
    if (!run) throw new Error('Forge installer wymaga zainstalowanej Javy.');
    throw new Error(`Forge installer zakończył się kodem ${run.code}.\n${run.tail}`);
  }

  // Copy generated version + libraries into our data root
  const fakeVersions = path.join(fakeRoot, 'versions');
  if (fs.existsSync(fakeVersions)) {
    for (const v of fs.readdirSync(fakeVersions)) {
      copyDir(path.join(fakeVersions, v), path.join(paths.versions, v));
    }
  }
  const fakeLibs = path.join(fakeRoot, 'libraries');
  if (fs.existsSync(fakeLibs)) {
    copyDir(fakeLibs, paths.libraries);
  }

  // Find the new version id (the installer names the folder e.g. "1.20.1-forge-47.2.0")
  const installed = findInstalledForge(mcVersion, forgeVersion);
  if (!installed) throw new Error('Forge installer nie utworzył wersji.');
  return installed;
}

/**
 * Install a Forge **server** into `serverDir` via the installer's
 * `--installServer` mode (modern arg-file based launch, MC 1.17+).
 */
export async function installForgeServer(
  mcVersion: string,
  forgeVersion: string,
  serverDir: string,
  javaExe: string,
  log: (line: string) => void
): Promise<void> {
  const resolvedBuild = await resolveForgeBuild(mcVersion, forgeVersion);
  const fullVersion = `${mcVersion}-${resolvedBuild}`;
  const installerPath = path.join(paths.cache, `forge-${fullVersion}-installer.jar`);
  await downloadFile(FORGE_INSTALLER(fullVersion), installerPath);
  await runServerInstaller(javaExe, installerPath, serverDir, log);
}

/** Run the installer headless, capturing output so failures are explainable. */
function runForgeInstaller(
  java: string,
  installerPath: string,
  fakeRoot: string
): Promise<{ code: number | null; tail: string }> {
  return new Promise((resolve) => {
    // cwd = fakeRoot so the installer's "<name>.log" doesn't litter the app dir.
    const child = spawn(java, ['-jar', installerPath, '--installClient', fakeRoot], {
      cwd: fakeRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    const collect = (b: Buffer): void => {
      process.stdout.write(b);
      out = (out + b.toString()).slice(-1500);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (err) => resolve({ code: -1, tail: String(err) }));
    child.on('exit', (code) => resolve({ code, tail: out.trim() }));
  });
}

/**
 * Installs an old-style (≤ 1.12) Forge from its installer jar without running it:
 * the jar bundles the version json (`versionInfo`) and the universal jar, which is
 * all the installer ever placed on disk — libraries are fetched at launch.
 */
function installForgeLegacy(installerPath: string): string | null {
  try {
    const zip = new AdmZip(installerPath);
    const entry = zip.getEntry('install_profile.json');
    if (!entry) return null;
    const profile = JSON.parse(entry.getData().toString('utf8')) as {
      install?: { path?: string; filePath?: string; minecraft?: string };
      versionInfo?: { id?: string; inheritsFrom?: string };
    };
    const info = profile.versionInfo;
    const { path: coord, filePath, minecraft } = profile.install ?? {};
    if (!info?.id || !coord || !filePath) return null;
    const universal = zip.getEntry(filePath);
    if (!universal) return null;

    const jarDest = path.join(paths.libraries, libraryArtifactPath(coord));
    fs.mkdirSync(path.dirname(jarDest), { recursive: true });
    fs.writeFileSync(jarDest, universal.getData());

    const versionDir = path.join(paths.versions, info.id);
    fs.mkdirSync(versionDir, { recursive: true });
    fs.writeFileSync(
      path.join(versionDir, `${info.id}.json`),
      JSON.stringify({ ...info, inheritsFrom: info.inheritsFrom ?? minecraft }, null, 2)
    );
    return info.id;
  } catch {
    return null;
  }
}

/** Find an already-installed Forge profile id for this MC/Forge pair, if any. */
function findInstalledForge(mcVersion: string, forgeVersion: string): string | null {
  if (!fs.existsSync(paths.versions)) return null;
  const hit = fs
    .readdirSync(paths.versions)
    .find(
      (n) =>
        n.toLowerCase().includes('forge') &&
        n.includes(mcVersion) &&
        n.includes(forgeVersion) &&
        fs.existsSync(path.join(paths.versions, n, `${n}.json`))
    );
  return hit ?? null;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else if (!fs.existsSync(d)) fs.copyFileSync(s, d);
  }
}
