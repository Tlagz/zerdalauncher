import fs from 'fs';
import path from 'path';
import { getJson } from '../utils/http';
import { paths } from '../utils/paths';
import type { VersionData } from '../minecraft/manifest';
import type { LoaderVersionInfo } from '../../shared/types';

const FABRIC_META = 'https://meta.fabricmc.net/v2';

interface FabricLoader {
  loader: { version: string; stable: boolean };
  intermediary: { version: string };
}

/** Fabric's meta API is already sorted newest-first for each bucket. */
export async function fabricLoaders(mcVersion: string): Promise<LoaderVersionInfo> {
  const data = await getJson<FabricLoader[]>(`${FABRIC_META}/versions/loader/${mcVersion}`);
  const stable = data.filter((l) => l.loader.stable).map((l) => l.loader.version);
  const unstable = data.filter((l) => !l.loader.stable).map((l) => l.loader.version);
  return { latest: stable[0] ?? unstable[0], stable, unstable };
}

export async function installFabric(
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  // Fabric meta endpoint returns a ready-to-use version JSON with inheritsFrom set
  const profile = await getJson<VersionData>(
    `${FABRIC_META}/versions/loader/${mcVersion}/${loaderVersion}/profile/json`
  );
  const versionId = profile.id;
  const dir = path.join(paths.versions, versionId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${versionId}.json`), JSON.stringify(profile, null, 2));
  return versionId;
}
