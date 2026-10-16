import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface JarMods {
  file: string;
  /** Mod ids the jar declares (fabric.mod.json, mods.toml, mcmod.info). */
  ids: string[];
  /** Which loader the metadata targets; 'unknown' for plain libraries. */
  kind: 'fabric' | 'forge' | 'both' | 'unknown';
  mtimeMs: number;
}

function text(zip: AdmZip, name: string): string | null {
  const e = zip.getEntry(name);
  return e ? e.getData().toString('utf8') : null;
}

/** Read the mod ids out of one jar without unpacking it. */
export function readJarMods(file: string): JarMods {
  const ids = new Set<string>();
  let fabric = false;
  let forge = false;
  try {
    const zip = new AdmZip(file);
    for (const name of ['fabric.mod.json', 'quilt.mod.json']) {
      const raw = text(zip, name);
      if (!raw) continue;
      fabric = true;
      try {
        // fabric.mod.json allows raw newlines inside strings; flatten before parsing.
        const json = JSON.parse(raw.replace(/[\r\n\t]+/g, ' '));
        const id = json.id ?? json.quilt_loader?.id;
        if (typeof id === 'string') ids.add(id);
      } catch {
        const m = raw.match(/"id"\s*:\s*"([^"]+)"/);
        if (m) ids.add(m[1]);
      }
    }
    for (const name of ['META-INF/mods.toml', 'META-INF/neoforge.mods.toml']) {
      const raw = text(zip, name);
      if (!raw) continue;
      forge = true;
      for (const m of raw.matchAll(/^\s*modId\s*=\s*["']([^"']+)["']/gm)) ids.add(m[1]);
    }
    const info = text(zip, 'mcmod.info');
    if (info) {
      forge = true;
      for (const m of info.matchAll(/"modid"\s*:\s*"([^"]+)"/g)) ids.add(m[1]);
    }
  } catch {
    /* not a readable zip */
  }
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(file).mtimeMs;
  } catch {
    /* ignore */
  }
  return {
    file: path.basename(file),
    ids: [...ids],
    kind: fabric && forge ? 'both' : fabric ? 'fabric' : forge ? 'forge' : 'unknown',
    mtimeMs
  };
}

/** Every enabled jar in a mods folder with its declared ids. */
export function scanModsFolder(dir: string): JarMods[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.jar$/i.test(f))
    .map((f) => readJarMods(path.join(dir, f)));
}
