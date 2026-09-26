import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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
  if (!java) throw new Error('Forge installer wymaga zainstalowanej Javy.');

  // We need a .minecraft-like directory with launcher_profiles.json for the installer
  const fakeRoot = path.join(paths.cache, 'forge-install-root');
  fs.mkdirSync(fakeRoot, { recursive: true });
  const profiles = path.join(fakeRoot, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) {
    fs.writeFileSync(profiles, JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '' }));
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(java, ['-jar', installerPath, '--installClient', fakeRoot], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('Forge installer exit ' + code))));
  });

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

/** Find an already-installed Forge profile id for this MC/Forge pair, if any. */
function findInstalledForge(mcVersion: string, forgeVersion: string): string | null {
  if (!fs.existsSync(paths.versions)) return null;
  const hit = fs
    .readdirSync(paths.versions)
    .find(
      (n) =>
        n.includes('forge') &&
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
