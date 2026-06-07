import fs from 'fs';
import path from 'path';
import { getJson, downloadFile } from '../utils/http';
import { paths } from '../utils/paths';
import { getJavaMajor, findSystemJava } from '../utils/java';
import type { ProgressCallback } from './downloader';
import type { VersionData } from './manifest';
import type { AppSettings, Instance } from '../../shared/types';

const RUNTIME_MANIFEST =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

interface RuntimeEntry {
  manifest: { sha1: string; size: number; url: string };
  version: { name: string; released: string };
}
type RuntimeManifest = Record<string, Record<string, RuntimeEntry[]>>;

interface RuntimeFiles {
  files: Record<
    string,
    {
      type: 'directory' | 'file' | 'link';
      executable?: boolean;
      target?: string;
      downloads?: {
        raw: { url: string; sha1: string; size: number };
        lzma?: { url: string; sha1: string; size: number };
      };
    }
  >;
}

function platformKey(): string {
  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return 'windows-arm64';
    if (process.arch === 'ia32') return 'windows-x86';
    return 'windows-x64';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'mac-os-arm64' : 'mac-os';
  }
  if (process.platform === 'linux') {
    return process.arch === 'ia32' ? 'linux-i386' : 'linux';
  }
  throw new Error(`Nieobsługiwana platforma: ${process.platform}`);
}

function javaExePath(dir: string): string {
  return process.platform === 'win32'
    ? path.join(dir, 'bin', 'javaw.exe')
    : path.join(dir, 'bin', 'java');
}

/**
 * Ensure the Mojang-provided Java runtime for the given component is installed,
 * returning the path to its java(w) executable. Components are e.g.
 * 'jre-legacy' (Java 8), 'java-runtime-gamma' (17), 'java-runtime-delta' (21).
 */
export async function ensureMojangJre(
  component: string,
  progress: ProgressCallback
): Promise<string> {
  const pk = platformKey();
  const installDir = path.join(paths.runtimes, component, pk);
  const javaExe = javaExePath(installDir);
  if (fs.existsSync(javaExe)) return javaExe;

  progress('java', 0, 1, `Pobieram środowisko Java (${component})`);
  const manifest = await getJson<RuntimeManifest>(RUNTIME_MANIFEST);
  const entries = manifest[pk]?.[component];
  if (!entries || entries.length === 0) {
    throw new Error(`Mojang nie udostępnia runtime "${component}" dla ${pk}.`);
  }
  const filesManifest = await getJson<RuntimeFiles>(entries[0].manifest.url);

  const fileEntries = Object.entries(filesManifest.files);
  const downloadable = fileEntries.filter(([, f]) => f.type === 'file' && f.downloads?.raw);

  // Create directories first
  for (const [rel, f] of fileEntries) {
    if (f.type === 'directory') fs.mkdirSync(path.join(installDir, rel), { recursive: true });
  }

  let done = 0;
  const concurrency = 8;
  for (let i = 0; i < downloadable.length; i += concurrency) {
    const batch = downloadable.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async ([rel, f]) => {
        const dest = path.join(installDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        await downloadFile(f.downloads!.raw.url, dest, f.downloads!.raw.sha1);
        if (f.executable && process.platform !== 'win32') {
          try {
            fs.chmodSync(dest, 0o755);
          } catch {
            /* ignore */
          }
        }
      })
    );
    done += batch.length;
    progress('java', done, downloadable.length, `Java (${component})`);
  }

  // Symlinks (mac/linux). On Windows these generally don't appear.
  for (const [rel, f] of fileEntries) {
    if (f.type === 'link' && f.target) {
      const linkPath = path.join(installDir, rel);
      try {
        fs.mkdirSync(path.dirname(linkPath), { recursive: true });
        if (!fs.existsSync(linkPath)) fs.symlinkSync(f.target, linkPath);
      } catch {
        /* ignore */
      }
    }
  }

  if (!fs.existsSync(javaExe)) {
    throw new Error(`Pobranie runtime ${component} nie powiodło się (brak ${javaExe}).`);
  }
  return javaExe;
}

/**
 * Decide which Java executable to launch a version with.
 * Priority: explicit per-instance path → global settings path → matching
 * system Java → auto-downloaded Mojang runtime.
 */
export async function resolveJava(
  instance: Instance,
  versionData: VersionData,
  settings: AppSettings,
  progress: ProgressCallback
): Promise<string> {
  const requiredMajor = versionData.javaVersion?.majorVersion ?? 8;
  const component = versionData.javaVersion?.component ?? 'jre-legacy';

  // 1. Explicit overrides — trust the user but fail clearly if too old.
  const override = instance.javaPath?.trim() || settings.javaPath?.trim();
  if (override) {
    const major = getJavaMajor(override);
    if (major === null) throw new Error(`Wskazana Java nie działa: ${override}`);
    if (major < requiredMajor) {
      throw new Error(
        `Ta wersja wymaga Java ${requiredMajor}+, a wskazana ścieżka to Java ${major}. ` +
          `Wyczyść ścieżkę w ustawieniach, aby launcher pobrał właściwą Javę automatycznie.`
      );
    }
    return override;
  }

  // 2. A suitable system Java.
  const sys = findSystemJava(requiredMajor);
  if (sys) return sys;

  // 3. Auto-download the exact runtime Mojang ships for this version.
  try {
    return await ensureMojangJre(component, progress);
  } catch (err) {
    throw new Error(
      `Ta wersja Minecraft wymaga Java ${requiredMajor}, której nie znaleziono w systemie, ` +
        `a automatyczne pobranie zawiodło: ${(err as Error).message}`
    );
  }
}
