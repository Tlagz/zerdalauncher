import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { protocol, net, nativeImage } from 'electron';
import { pathToFileURL } from 'url';
import type { Worker } from 'worker_threads';
import createWorker from './worker?nodeWorker';
import { readNbt, type NbtCompound } from './nbt';
import { REGION } from './render';
import { paths, instanceGameDir, serverDir } from '../utils/paths';
import type { MapDimension, MapInfo, MapTarget } from '../../shared/types';

export const MAP_SCHEME = 'zerda-map';
// Bump when the renderer changes so old cached tiles are redrawn.
const RENDER_VERSION = 'v1';
const DIM_DIRS: Record<MapDimension, string> = { overworld: 'region', nether: 'DIM-1/region', end: 'DIM1/region' };

/** Opened worlds by token, so tile URLs never carry file paths. */
const worlds = new Map<string, string>();

// ---------- worker pool ----------

const pool: Array<{ worker: Worker; busy: boolean }> = [];
const queue: Array<{ file: string; cave: boolean; resolve: (b: Buffer) => void; reject: (e: Error) => void }> = [];
const pending = new Map<number, { resolve: (b: Buffer) => void; reject: (e: Error) => void }>();
let nextId = 0;

function pump(): void {
  while (queue.length) {
    let slot = pool.find((w) => !w.busy);
    if (!slot && pool.length < Math.max(1, Math.min(4, os.cpus().length - 1))) {
      const worker = createWorker({});
      slot = { worker, busy: false };
      const s = slot;
      worker.on('message', (m: { id: number; buf?: Uint8Array; error?: string }) => {
        s.busy = false;
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.buf) p?.resolve(Buffer.from(m.buf.buffer, m.buf.byteOffset, m.buf.byteLength));
        else p?.reject(new Error(m.error ?? 'render failed'));
        pump();
      });
      worker.on('error', () => {
        pool.splice(pool.indexOf(s), 1);
        pump();
      });
      pool.push(slot);
    }
    if (!slot) return;
    const job = queue.shift()!;
    const id = ++nextId;
    pending.set(id, job);
    slot.busy = true;
    slot.worker.postMessage({ id, file: job.file, cave: job.cave });
  }
}

const renderInWorker = (file: string, cave: boolean) =>
  new Promise<Buffer>((resolve, reject) => {
    queue.push({ file, cave, resolve, reject });
    pump();
  });

// ---------- opening a world ----------

function worldDir(target: MapTarget): string {
  if (target.kind === 'instance') {
    if (!target.world || target.world !== path.basename(target.world)) throw new Error('Nieprawidłowy świat.');
    return path.join(instanceGameDir(target.instanceId), 'saves', target.world);
  }
  // Hosted server: the world folder named in server.properties (level-name).
  const dir = serverDir(target.serverId);
  let level = 'world';
  try {
    const m = fs.readFileSync(path.join(dir, 'server.properties'), 'utf8').match(/^level-name=(.+)$/m);
    if (m && m[1].trim() === path.basename(m[1].trim())) level = m[1].trim();
  } catch {
    /* default */
  }
  return path.join(dir, level);
}

const REGION_RE = /^r\.(-?\d+)\.(-?\d+)\.mca$/;

function listRegions(dir: string): Array<[number, number]> {
  if (!fs.existsSync(dir)) return [];
  const out: Array<[number, number]> = [];
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(REGION_RE);
    if (!m) continue;
    try {
      if (fs.statSync(path.join(dir, f)).size > 8192) out.push([Number(m[1]), Number(m[2])]);
    } catch {
      /* ignore */
    }
  }
  return out;
}

const dimOf = (d: unknown): MapDimension =>
  d === -1 || d === 'minecraft:the_nether' ? 'nether' : d === 1 || d === 'minecraft:the_end' ? 'end' : 'overworld';

export function openMap(target: MapTarget): MapInfo {
  const dir = worldDir(target);
  if (!fs.existsSync(dir)) throw new Error('Świat nie istnieje.');
  const dims = {} as MapInfo['dims'];
  for (const [dim, sub] of Object.entries(DIM_DIRS) as Array<[MapDimension, string]>) {
    const regions = listRegions(path.join(dir, sub));
    if (regions.length) dims[dim] = regions;
  }
  let spawn: MapInfo['spawn'];
  let player: MapInfo['player'];
  try {
    const data = readNbt(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'level.dat')))).Data as NbtCompound;
    const sp = data.spawn as NbtCompound | undefined; // 1.21.5+
    const pos = sp?.pos as { buf: Buffer } | undefined;
    if (typeof data.SpawnX === 'number' && typeof data.SpawnZ === 'number') spawn = { x: data.SpawnX, z: data.SpawnZ };
    else if (pos?.buf?.length === 12) spawn = { x: pos.buf.readInt32BE(0), z: pos.buf.readInt32BE(8) };
    const p = data.Player as NbtCompound | undefined;
    const ppos = p?.Pos as number[] | undefined;
    if (ppos?.length === 3) player = { x: Math.floor(ppos[0]), z: Math.floor(ppos[2]), dim: dimOf(p?.Dimension) };
  } catch {
    /* no or unreadable level.dat */
  }
  const token = crypto.randomBytes(9).toString('base64url');
  worlds.set(token, dir);
  return { token, name: path.basename(dir), dims, spawn, player };
}

// ---------- tiles ----------

function cacheFile(dir: string, dim: MapDimension, x: number, z: number): string {
  const key = crypto.createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0, 16);
  return path.join(paths.cache, 'maps', RENDER_VERSION, key, dim, `r.${x}.${z}.png`);
}

async function tile(dir: string, dim: MapDimension, x: number, z: number): Promise<string | null> {
  const region = path.join(dir, DIM_DIRS[dim], `r.${x}.${z}.mca`);
  if (!fs.existsSync(region)) return null;
  const out = cacheFile(dir, dim, x, z);
  try {
    if (fs.statSync(out).mtimeMs >= fs.statSync(region).mtimeMs) return out;
  } catch {
    /* not cached yet */
  }
  const bgra = await renderInWorker(region, dim === 'nether');
  const png = nativeImage.createFromBitmap(bgra, { width: REGION, height: REGION }).toPNG();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  return out;
}

/** Serves `zerda-map://tile/<token>/<dim>/<x>/<z>.png`. */
export function registerMapProtocol(): void {
  protocol.handle(MAP_SCHEME, async (req) => {
    try {
      const url = new URL(req.url);
      const [, token, dim, xs, zs] = url.pathname.split('/');
      const dir = worlds.get(token);
      const x = Number(xs);
      const z = Number(zs?.replace(/\.png$/, ''));
      if (!dir || !(dim in DIM_DIRS) || !Number.isInteger(x) || !Number.isInteger(z)) {
        return new Response('bad request', { status: 400 });
      }
      const file = await tile(dir, dim as MapDimension, x, z);
      return file ? net.fetch(pathToFileURL(file).toString()) : new Response('not found', { status: 404 });
    } catch {
      return new Response('render failed', { status: 500 });
    }
  });
}
