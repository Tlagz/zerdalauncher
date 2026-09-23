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

/**
 * Every Forge build ever published, not just the "recommended"/"latest" ones
 * promoted on the website — lets users pick unstable/beta builds too.
 */
export async function forgeVersionsFor(mcVersion: string): Promise<LoaderVersionInfo> {
  const [promotions, metadata] = await Promise.all([
    getJson<ForgePromotions>(FORGE_PROMOTIONS),
    getText(FORGE_METADATA)
  ]);
  const recommended = promotions.promos[`${mcVersion}-recommended`];
  const latest = promotions.promos[`${mcVersion}-latest`];

  const prefix = `${mcVersion}-`;
  const allBuilds = Array.from(metadata.matchAll(/<version>([^<]+)<\/version>/g))
    .map((m) => m[1])
    .filter((v) => v.startsWith(prefix))
    .map((v) => v.slice(prefix.length))
    .sort(compareForgeBuild)
    .reverse();

  const promoted = new Set([recommended, latest].filter(Boolean) as string[]);
  const stable = [recommended, latest].filter(Boolean) as string[];
  const unstable = allBuilds.filter((v) => !promoted.has(v));

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

  const fullVersion = `${mcVersion}-${forgeVersion}`;
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
  const fullVersion = `${mcVersion}-${forgeVersion}`;
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
