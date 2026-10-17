import fs from 'fs';
import path from 'path';
import { listInstances } from './instances';
import { instanceGameDir } from '../utils/paths';
import type { SavedServer } from '../../shared/types';

// ---------- minimal NBT reader (servers.dat is uncompressed big-endian NBT) ----------

type Nbt = number | bigint | string | Nbt[] | { [k: string]: Nbt } | number[];

function readNbt(buf: Buffer): Record<string, Nbt> {
  let at = 0;
  const u8 = () => buf.readUInt8(at++);
  const i16 = () => ((at += 2), buf.readInt16BE(at - 2));
  const i32 = () => ((at += 4), buf.readInt32BE(at - 4));
  const str = () => {
    const len = buf.readUInt16BE(at);
    at += 2;
    return buf.toString('utf8', at, (at += len));
  };
  const payload = (type: number): Nbt => {
    switch (type) {
      case 1: return buf.readInt8(at++);
      case 2: return i16();
      case 3: return i32();
      case 4: return ((at += 8), buf.readBigInt64BE(at - 8));
      case 5: return ((at += 4), buf.readFloatBE(at - 4));
      case 6: return ((at += 8), buf.readDoubleBE(at - 8));
      case 7: { const n = i32(); at += n; return []; }
      case 8: return str();
      case 9: {
        const t = u8();
        const n = i32();
        return Array.from({ length: Math.max(0, n) }, () => payload(t));
      }
      case 10: {
        const o: Record<string, Nbt> = {};
        for (let t = u8(); t !== 0; t = u8()) o[str()] = payload(t);
        return o;
      }
      case 11: { const n = i32(); at += n * 4; return []; }
      case 12: { const n = i32(); at += n * 8; return []; }
      default: throw new Error(`NBT tag ${type}`);
    }
  };
  if (u8() !== 10) throw new Error('not a compound');
  str();
  return payload(10) as Record<string, Nbt>;
}

/** Servers from an instance's in-game multiplayer list. */
function serversDat(instanceId: string): Array<{ name: string; address: string; icon?: string }> {
  const file = path.join(instanceGameDir(instanceId), 'servers.dat');
  if (!fs.existsSync(file)) return [];
  try {
    const root = readNbt(fs.readFileSync(file));
    const list = (root.servers as Array<Record<string, Nbt>>) ?? [];
    return list
      .filter((s) => typeof s.ip === 'string' && s.ip && !s.hidden)
      .map((s) => ({
        name: typeof s.name === 'string' ? s.name : String(s.ip),
        address: String(s.ip),
        icon: typeof s.icon === 'string' && s.icon ? `data:image/png;base64,${s.icon}` : undefined
      }));
  } catch {
    return [];
  }
}

/**
 * Every server the user plays on: each instance's auto-join address and its
 * in-game server list. One entry per address, joined with the most recently
 * played instance that has it.
 */
export function listSavedServers(): SavedServer[] {
  const out = new Map<string, SavedServer>();
  const instances = listInstances().sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  for (const inst of instances) {
    const entries = [
      ...(inst.serverAddress ? [{ name: inst.serverAddress, address: inst.serverAddress }] : []),
      ...serversDat(inst.id)
    ];
    for (const s of entries) {
      const key = s.address.trim().toLowerCase();
      if (!key || out.has(key)) continue;
      out.set(key, { ...s, instanceId: inst.id, instanceName: inst.name, mcVersion: inst.mcVersion });
    }
  }
  return [...out.values()];
}
