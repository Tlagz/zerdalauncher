import fs from 'fs';
import path from 'path';
import { paths } from './utils/paths';

/**
 * UI sounds come from the Minecraft assets the launcher already downloaded for
 * the user's games — nothing is bundled. Returns what was found; the renderer
 * synthesizes stand-ins for the rest.
 */
const WANTED: Record<string, string[]> = {
  click: ['minecraft/sounds/random/click.ogg'],
  launch: ['minecraft/sounds/random/levelup.ogg'],
  success: ['minecraft/sounds/random/orb.ogg'],
  toast: ['minecraft/sounds/ui/toast/in.ogg', 'minecraft/sounds/random/pop.ogg'],
  error: ['minecraft/sounds/mob/villager/no1.ogg', 'minecraft/sounds/mob/villager/no2.ogg', 'minecraft/sounds/note/bass.ogg']
};

let cache: Record<string, string> | null = null;

export function uiSounds(): Record<string, string> {
  if (cache && Object.keys(cache).length === Object.keys(WANTED).length) return cache;
  const out: Record<string, string> = {};
  const dir = path.join(paths.assets, 'indexes');
  const indexes = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(dir, f))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  for (const file of indexes) {
    let objects: Record<string, { hash: string }>;
    try {
      objects = JSON.parse(fs.readFileSync(file, 'utf8')).objects ?? {};
    } catch {
      continue;
    }
    for (const [name, keys] of Object.entries(WANTED)) {
      if (out[name]) continue;
      for (const key of keys) {
        const hash = objects[key]?.hash;
        const obj = hash && path.join(paths.assets, 'objects', hash.slice(0, 2), hash);
        if (obj && fs.existsSync(obj)) {
          out[name] = `data:audio/ogg;base64,${fs.readFileSync(obj).toString('base64')}`;
          break;
        }
      }
    }
    if (Object.keys(out).length === Object.keys(WANTED).length) break;
  }
  cache = out;
  return out;
}
