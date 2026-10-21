import fs from 'fs';
import zlib from 'zlib';
import { readNbt, isArray, type NbtArray, type NbtCompound, type NbtValue } from './nbt';
import { blockColor, legacyColor, type RGB } from './colors';

export const REGION = 512; // blocks per region side
const NONE = -32768;
const WATER = blockColor('minecraft:water')!;

/** Read `bits` bits starting `offset` bits into long `index` (counted from each long's low end). */
function bitsAt(buf: Buffer, index: number, offset: number, bits: number): number {
  const base = index * 8;
  if (base + 8 > buf.length) return 0;
  const hi = buf.readUInt32BE(base);
  const lo = buf.readUInt32BE(base + 4);
  const mask = (1 << bits) - 1;
  if (offset + bits <= 32) return (lo >>> offset) & mask;
  if (offset >= 32) return (hi >>> (offset - 32)) & mask;
  return ((lo >>> offset) | (hi << (32 - offset))) & mask;
}

/** Entry `i` of a packed long array; `spanning` = 1.13–1.15 layout (entries cross long boundaries). */
function packed(arr: NbtArray, i: number, bits: number, spanning: boolean): number {
  if (!spanning) {
    const per = Math.floor(64 / bits);
    return bitsAt(arr.buf, Math.floor(i / per), (i % per) * bits, bits);
  }
  const bit = i * bits;
  const index = Math.floor(bit / 64);
  const off = bit % 64;
  if (off + bits <= 64) return bitsAt(arr.buf, index, off, bits);
  const lowBits = 64 - off;
  const low = bitsAt(arr.buf, index, off, lowBits);
  return low | (bitsAt(arr.buf, index + 1, 0, bits - lowBits) << lowBits);
}

interface Section {
  palette: Array<string | null>; // block ids (null = air)
  data?: NbtArray;
  bits: number;
}

interface ChunkView {
  /** Block id (string) or legacy color at x,y,z within the chunk; null for air. */
  colorAt(x: number, y: number, z: number): RGB | null;
  isWater(x: number, y: number, z: number): boolean;
  /** Y of the topmost non-air block in a column, or NONE. */
  top(x: number, z: number): number;
  minY: number;
}

const str = (v: NbtValue | undefined) => (typeof v === 'string' ? v : '');
const num = (v: NbtValue | undefined) => (typeof v === 'number' ? v : 0);

function modernChunk(root: NbtCompound): ChunkView | null {
  // 1.18+: sections/Heightmaps at the root; 1.13–1.17: under "Level".
  const level = (root.Level as NbtCompound | undefined) ?? root;
  const dataVersion = num(root.DataVersion);
  const spanning = dataVersion > 0 && dataVersion < 2529; // before 20w17a (1.16)
  const status = str(level.Status);
  if (status && !/full|postprocessed|fullchunk|spawn|heightmaps|features|light/.test(status)) return null;
  const rawSections = ((level.sections ?? level.Sections) as NbtCompound[] | undefined) ?? [];
  const sections = new Map<number, Section>();
  for (const s of rawSections) {
    const y = num(s.Y);
    const states = (s.block_states as NbtCompound | undefined) ?? s;
    const pal = (states.palette ?? states.Palette) as NbtCompound[] | undefined;
    if (!pal || !pal.length) continue;
    const data = (states.data ?? states.BlockStates) as NbtValue | undefined;
    const palette = pal.map((p) => {
      const name = str(p.Name);
      return /(^|:)(air|cave_air|void_air)$/.test(name) ? null : name;
    });
    sections.set(y, {
      palette,
      data: isArray(data) ? data : undefined,
      bits: Math.max(4, Math.ceil(Math.log2(palette.length)))
    });
  }
  if (!sections.size) return null;
  const minSection = typeof level.yPos === 'number' ? level.yPos : Math.min(...sections.keys());
  const minY = Math.min(minSection, ...sections.keys()) * 16;

  const idAt = (x: number, y: number, z: number): string | null => {
    const s = sections.get(Math.floor(y / 16));
    if (!s) return null;
    if (s.palette.length === 1 || !s.data) return s.palette[0];
    const i = ((((y % 16) + 16) % 16) * 16 + z) * 16 + x;
    return s.palette[packed(s.data, i, s.bits, spanning)] ?? null;
  };

  const maps = level.Heightmaps as NbtCompound | undefined;
  const hm = (maps?.MOTION_BLOCKING ?? maps?.WORLD_SURFACE) as NbtValue | undefined;
  const sectionYs = [...sections.keys()];
  const maxY = (Math.max(...sectionYs) + 1) * 16 - 1;
  const heightBits = isArray(hm) ? Math.ceil(Math.log2(maxY - minY + 2)) : 0;

  return {
    minY,
    colorAt: (x, y, z) => {
      const id = idAt(x, y, z);
      return id ? blockColor(id) : null;
    },
    isWater: (x, y, z) => {
      const id = idAt(x, y, z) ?? '';
      return id.endsWith('water') || id.endsWith('bubble_column') || id.endsWith('seagrass') || id.endsWith('kelp') || id.endsWith('kelp_plant');
    },
    top: (x, z) => {
      if (isArray(hm)) {
        // Heightmap value = blocks above minY, so the top block sits one below.
        const h = packed(hm, z * 16 + x, heightBits, spanning);
        if (h > 0) return h - 1 + minY;
      }
      for (let y = maxY; y >= minY; y--) if (idAt(x, y, z)) return y;
      return NONE;
    }
  };
}

function legacyChunk(root: NbtCompound): ChunkView | null {
  const level = root.Level as NbtCompound | undefined;
  if (!level) return null;
  const sections = new Map<number, Buffer>();
  for (const s of (level.Sections as NbtCompound[] | undefined) ?? []) {
    const blocks = s.Blocks;
    if (isArray(blocks)) sections.set(num(s.Y), blocks.buf);
  }
  const hm = level.HeightMap;
  const idAt = (x: number, y: number, z: number) => {
    const b = sections.get(y >> 4);
    return b ? b[((y & 15) * 16 + z) * 16 + x] : 0;
  };
  return {
    minY: 0,
    colorAt: (x, y, z) => legacyColor(idAt(x, y, z)),
    isWater: (x, y, z) => {
      const id = idAt(x, y, z);
      return id === 8 || id === 9;
    },
    top: (x, z) => {
      if (isArray(hm)) {
        const h = hm.buf.readInt32BE((z * 16 + x) * 4);
        for (let y = Math.min(255, h); y >= Math.max(0, h - 8); y--) if (idAt(x, y, z)) return y;
      }
      for (let y = 255; y >= 0; y--) if (idAt(x, y, z)) return y;
      return NONE;
    }
  };
}

function readChunk(file: Buffer, index: number): ChunkView | null {
  const loc = file.readUInt32BE(index * 4);
  const offset = (loc >>> 8) * 4096;
  if (!offset || offset + 5 > file.length) return null;
  const length = file.readUInt32BE(offset);
  const kind = file.readUInt8(offset + 4);
  const data = file.subarray(offset + 5, offset + 4 + length);
  let raw: Buffer;
  try {
    if (kind === 1) raw = zlib.gunzipSync(data);
    else if (kind === 2) raw = zlib.inflateSync(data);
    else if (kind === 3) raw = data;
    else return null; // LZ4 / external .mcc — not supported
    const root = readNbt(raw);
    // Pre-1.13 sections store numeric "Blocks"; later ones a block-state palette.
    const sections = ((root.Level as NbtCompound | undefined)?.Sections as NbtCompound[] | undefined) ?? [];
    const legacy = sections.some((s) => 'Blocks' in s && !('Palette' in s));
    return legacy ? legacyChunk(root) : modernChunk(root);
  } catch {
    return null;
  }
}

/**
 * Render one region file into a 512×512 BGRA image (1 px per block; missing
 * chunks are transparent). `cave` starts below the roof (the Nether).
 */
export function renderRegion(path: string, cave = false): Buffer {
  const file = fs.readFileSync(path);
  const out = Buffer.alloc(REGION * REGION * 4);
  if (file.length < 8192) return out;
  const height = new Int16Array(REGION * REGION).fill(NONE);
  const colors = new Uint8Array(REGION * REGION * 3);
  const wet = new Uint8Array(REGION * REGION);

  for (let cz = 0; cz < 32; cz++) {
    for (let cx = 0; cx < 32; cx++) {
      const chunk = readChunk(file, cz * 32 + cx);
      if (!chunk) continue;
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          let y = chunk.top(x, z);
          if (y === NONE) continue;
          if (cave) {
            // Skip the bedrock roof: find the first air below it, then the floor under that.
            let yy = Math.min(y, 120);
            while (yy > chunk.minY && chunk.colorAt(x, yy, z)) yy--;
            while (yy > chunk.minY && !chunk.colorAt(x, yy, z)) yy--;
            y = yy;
          }
          let c = chunk.colorAt(x, y, z);
          // Heightmaps can point one block above a removed block — step down a little.
          for (let k = 0; !c && k < 16 && y > chunk.minY; k++) c = chunk.colorAt(x, --y, z);
          if (!c) continue;
          const px = (cz * 16 + z) * REGION + cx * 16 + x;
          if (chunk.isWater(x, y, z)) {
            // Deeper water is darker; shallow water shows a bit of the bottom.
            let d = 0;
            while (d < 16 && y - d > chunk.minY && chunk.isWater(x, y - d, z)) d++;
            const floor = chunk.colorAt(x, y - d, z) ?? WATER;
            const w = Math.min(0.92, 0.45 + d * 0.06);
            c = [WATER[0] * w + floor[0] * (1 - w), WATER[1] * w + floor[1] * (1 - w), WATER[2] * w + floor[2] * (1 - w)];
            c = [c[0] * (1 - d * 0.012), c[1] * (1 - d * 0.012), c[2] * (1 - d * 0.008)];
            wet[px] = 1;
          }
          height[px] = y;
          colors[px * 3] = c[0];
          colors[px * 3 + 1] = c[1];
          colors[px * 3 + 2] = c[2];
        }
      }
    }
  }

  // Shade by height difference to the block north, like in-game maps.
  for (let pz = 0; pz < REGION; pz++) {
    for (let px = 0; px < REGION; px++) {
      const i = pz * REGION + px;
      if (height[i] === NONE) continue;
      let k = 1;
      if (!wet[i] && pz > 0 && height[i - REGION] !== NONE) {
        const d = height[i] - height[i - REGION];
        k = d > 0 ? 1.12 : d < 0 ? 0.84 : 1;
      }
      const o = i * 4;
      out[o] = Math.min(255, colors[i * 3 + 2] * k); // BGRA
      out[o + 1] = Math.min(255, colors[i * 3 + 1] * k);
      out[o + 2] = Math.min(255, colors[i * 3] * k);
      out[o + 3] = 255;
    }
  }
  return out;
}
