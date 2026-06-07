import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getJson, downloadFile } from '../utils/http';
import { paths } from '../utils/paths';
import { detectJava } from '../utils/java';

const NEO_VERSIONS =
  'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';
const NEO_INSTALLER = (v: string) =>
  `https://maven.neoforged.net/releases/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar`;

interface NeoVersionList {
  isSnapshot: boolean;
  versions: string[];
}

/**
 * NeoForge version ids embed the MC version. Two schemes exist:
 *  - Legacy (MC `1.X.Y`):      NeoForge `X.Y.<build>`  (1.21   -> "21.0.*",
 *                                                       1.21.1 -> "21.1.*")
 *  - Modern (MC `26.1.2`, …):  NeoForge `<mcVersion>.<build>` ("26.1.2" -> "26.1.2.*")
 * NeoForge exists for MC >= 1.20.2.
 */
function neoPrefix(mcVersion: string): string | null {
  const legacy = mcVersion.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (legacy) {
    const minor = legacy[1];
    const patch = legacy[2] ?? '0';
    return `${minor}.${patch}.`;
  }
  // Modern year-based MC versioning (2025+): NeoForge id is "<mcVersion>.<build>".
  if (/^\d+\.\d+(?:\.\d+)?$/.test(mcVersion)) return `${mcVersion}.`;
  return null; // snapshots / pre-releases have no stable NeoForge mapping
}

function compareNeo(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export async function neoforgeVersionsFor(
  mcVersion: string
): Promise<{ latest?: string; versions: string[] }> {
  const prefix = neoPrefix(mcVersion);
  if (!prefix) return { versions: [] };
  const data = await getJson<NeoVersionList>(NEO_VERSIONS);
  const matching = data.versions
    .filter((v) => v.startsWith(prefix) && !v.includes('beta'))
    .sort(compareNeo)
    .reverse();
  // Fall back to including betas if nothing stable matched.
  const list = matching.length
    ? matching
    : data.versions.filter((v) => v.startsWith(prefix)).sort(compareNeo).reverse();
  return { latest: list[0], versions: list };
}

/**
 * NeoForge ships a Forge-style installer. We run it headless against a throwaway
 * .minecraft-like root, then copy the generated version JSON + libraries into our
 * data root so the normal (inheritsFrom -> vanilla) pipeline can resolve it.
 */
export async function installNeoForge(neoVersion: string): Promise<string> {
  // Already installed? Skip the (slow) installer entirely.
  const existing = findInstalledNeoForge(neoVersion);
  if (existing) return existing;

  const installerPath = path.join(paths.cache, `neoforge-${neoVersion}-installer.jar`);
  await downloadFile(NEO_INSTALLER(neoVersion), installerPath);

  const java = detectJava();
  if (!java) throw new Error('Instalator NeoForge wymaga zainstalowanej Javy.');

  const fakeRoot = path.join(paths.cache, 'neoforge-install-root');
  fs.mkdirSync(fakeRoot, { recursive: true });
  const profiles = path.join(fakeRoot, 'launcher_profiles.json');
  if (!fs.existsSync(profiles)) {
    fs.writeFileSync(
      profiles,
      JSON.stringify({ profiles: {}, selectedProfile: '', clientToken: '' })
    );
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(java, ['-jar', installerPath, '--installClient', fakeRoot], {
      stdio: 'inherit'
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Instalator NeoForge zakończył się kodem ' + code))
    );
  });

  const fakeVersions = path.join(fakeRoot, 'versions');
  if (fs.existsSync(fakeVersions)) {
    for (const v of fs.readdirSync(fakeVersions)) {
      copyDir(path.join(fakeVersions, v), path.join(paths.versions, v));
    }
  }
  const fakeLibs = path.join(fakeRoot, 'libraries');
  if (fs.existsSync(fakeLibs)) copyDir(fakeLibs, paths.libraries);

  const installed = findInstalledNeoForge(neoVersion);
  if (!installed) throw new Error('Instalator NeoForge nie utworzył wersji.');
  return installed;
}

/** Find an already-installed NeoForge profile id for this version, if any. */
function findInstalledNeoForge(neoVersion: string): string | null {
  if (!fs.existsSync(paths.versions)) return null;
  const hit = fs
    .readdirSync(paths.versions)
    .find(
      (n) =>
        n.startsWith('neoforge-') &&
        n.includes(neoVersion) &&
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
