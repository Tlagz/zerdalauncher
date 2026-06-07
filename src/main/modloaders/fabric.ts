import fs from 'fs';
import path from 'path';
import { getJson } from '../utils/http';
import { paths } from '../utils/paths';
import type { VersionData } from '../minecraft/manifest';

const FABRIC_META = 'https://meta.fabricmc.net/v2';

interface FabricLoader {
  loader: { version: string; stable: boolean };
  intermediary: { version: string };
}

export async function fabricLoaders(mcVersion: string): Promise<string[]> {
  const data = await getJson<FabricLoader[]>(`${FABRIC_META}/versions/loader/${mcVersion}`);
  return data.filter((l) => l.loader.stable || true).map((l) => l.loader.version);
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
