import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import {
  VersionData,
  Library,
  fetchVersionData,
  evaluateRules,
  nativesClassifier,
  libraryArtifactPath
} from './manifest';
import { downloadFile, getJson } from '../utils/http';
import { paths } from '../utils/paths';

export type ProgressCallback = (phase: string, current: number, total: number, msg?: string) => void;

const RESOURCES_BASE = 'https://resources.download.minecraft.net';

export interface PreparedVersion {
  data: VersionData;
  clientJar: string;
  nativesDir: string;
  classpath: string[];
  assetIndexId: string;
}

export async function prepareVersion(
  versionId: string,
  instanceId: string,
  progress: ProgressCallback
): Promise<PreparedVersion> {
  progress('manifest', 0, 1, `Pobieram manifest dla ${versionId}`);
  let data = await fetchVersionData(versionId);

  // Resolve version inheritance (Fabric/Forge inherit from vanilla)
  if (data.inheritsFrom) {
    const parent = await fetchVersionData(data.inheritsFrom);
    data = mergeVersionData(parent, data);
  }

  progress('client', 0, 1, 'Pobieram client.jar');
  const clientJarDir = path.join(paths.versions, data.id);
  const clientJar = path.join(clientJarDir, `${data.id}.jar`);
  if (data.downloads?.client) {
    await downloadFile(data.downloads.client.url, clientJar, data.downloads.client.sha1);
  }

  const libs = data.libraries.filter((l) => evaluateRules(l.rules));
  const classpath: string[] = [];
  const nativesDir = path.join(paths.natives, instanceId);
  fs.mkdirSync(nativesDir, { recursive: true });

  progress('libraries', 0, libs.length, 'Pobieram biblioteki');
  for (let i = 0; i < libs.length; i++) {
    const lib = libs[i];
    const cpEntries = await downloadLibrary(lib, nativesDir);
    classpath.push(...cpEntries);
    progress('libraries', i + 1, libs.length, lib.name);
  }
  classpath.push(clientJar);

  // Assets
  progress('assets-index', 0, 1, 'Pobieram indeks zasobów');
  const assetIndexPath = path.join(paths.assets, 'indexes', `${data.assetIndex.id}.json`);
  await downloadFile(data.assetIndex.url, assetIndexPath, data.assetIndex.sha1);
  const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, 'utf8')) as {
    objects: Record<string, { hash: string; size: number }>;
  };
  const objects = Object.values(assetIndex.objects);
  progress('assets', 0, objects.length, 'Pobieram zasoby');
  let downloaded = 0;
  const concurrency = 16;
  for (let i = 0; i < objects.length; i += concurrency) {
    const batch = objects.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (obj) => {
        const sub = obj.hash.substring(0, 2);
        const url = `${RESOURCES_BASE}/${sub}/${obj.hash}`;
        const dest = path.join(paths.assets, 'objects', sub, obj.hash);
        await downloadFile(url, dest, obj.hash);
      })
    );
    downloaded += batch.length;
    progress('assets', downloaded, objects.length);
  }

  return { data, clientJar, nativesDir, classpath, assetIndexId: data.assetIndex.id };
}

async function downloadLibrary(lib: Library, nativesDir: string): Promise<string[]> {
  const entries: string[] = [];
  if (lib.downloads?.artifact) {
    const relPath = lib.downloads.artifact.path ?? libraryArtifactPath(lib.name);
    const dest = path.join(paths.libraries, relPath);
    await downloadFile(lib.downloads.artifact.url, dest, lib.downloads.artifact.sha1);
    entries.push(dest);
  } else if (!lib.natives) {
    // Maven-style library (Fabric/Forge) with no explicit downloads.
    // Natives-only libraries (lib.natives set) have no main jar — skip here,
    // they are handled by the classifiers block below.
    const relPath = libraryArtifactPath(lib.name);
    const dest = path.join(paths.libraries, relPath);
    if (!fs.existsSync(dest)) {
      const base = (lib.url ?? 'https://libraries.minecraft.net/').replace(/\/$/, '/');
      const bases = [base, 'https://repo1.maven.org/maven2/', 'https://maven.minecraftforge.net/'];
      let ok = false;
      for (const b of bases) {
        try {
          await downloadFile(b + relPath, dest);
          ok = true;
          break;
        } catch {
          /* try next repo */
        }
      }
      if (!ok) throw new Error(`Nie udało się pobrać biblioteki ${lib.name} z żadnego repozytorium.`);
    }
    entries.push(dest);
  }

  // Natives (legacy via classifiers)
  const classifier = nativesClassifier();
  if (lib.natives && classifier) {
    const key = (lib.natives[process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'] ?? '').replace('${arch}', process.arch === 'x64' ? '64' : '32');
    const cls = lib.downloads?.classifiers?.[key];
    if (cls) {
      const relPath = cls.path ?? libraryArtifactPath(lib.name + ':' + key);
      const dest = path.join(paths.libraries, relPath);
      await downloadFile(cls.url, dest, cls.sha1);
      extractNatives(dest, nativesDir, lib.extract?.exclude);
    }
  }

  return entries;
}

function extractNatives(jarPath: string, dest: string, exclude?: string[]): void {
  const zip = new AdmZip(jarPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const name = entry.entryName;
    if (exclude?.some((p) => name.startsWith(p))) continue;
    if (!/\.(dll|so|dylib|jnilib)$/i.test(name)) continue;
    const outFile = path.join(dest, path.basename(name));
    fs.writeFileSync(outFile, entry.getData());
  }
}

function mergeVersionData(parent: VersionData, child: VersionData): VersionData {
  return {
    ...parent,
    ...child,
    libraries: [...(child.libraries ?? []), ...(parent.libraries ?? [])],
    arguments: mergeArgs(parent.arguments, child.arguments),
    mainClass: child.mainClass ?? parent.mainClass,
    assetIndex: child.assetIndex ?? parent.assetIndex,
    downloads: child.downloads ?? parent.downloads,
    assets: child.assets ?? parent.assets
  };
}

function mergeArgs(parent?: VersionData['arguments'], child?: VersionData['arguments']) {
  if (!parent && !child) return undefined;
  return {
    game: [...(parent?.game ?? []), ...(child?.game ?? [])],
    jvm: [...(parent?.jvm ?? []), ...(child?.jvm ?? [])]
  };
}
