/**
 * Minimal NBT reader for map rendering. Arrays stay as raw big-endian Buffer
 * slices (no copying, no BigInt) — the renderer unpacks only what it needs.
 */
export type NbtValue = number | bigint | string | NbtValue[] | NbtCompound | NbtArray;
export interface NbtCompound {
  [key: string]: NbtValue;
}
/** Byte/int/long array kept as raw bytes. */
export interface NbtArray {
  kind: 'byte' | 'int' | 'long';
  buf: Buffer;
  length: number;
}

export function isArray(v: NbtValue | undefined): v is NbtArray {
  return !!v && typeof v === 'object' && !Array.isArray(v) && 'buf' in v && Buffer.isBuffer((v as NbtArray).buf);
}

export function readNbt(buf: Buffer): NbtCompound {
  let at = 0;
  const str = (): string => {
    const len = buf.readUInt16BE(at);
    at += 2;
    const s = buf.toString('utf8', at, at + len);
    at += len;
    return s;
  };
  const arr = (kind: NbtArray['kind'], size: number): NbtArray => {
    const length = buf.readInt32BE(at);
    at += 4;
    const bytes = Math.max(0, length) * size;
    const out = { kind, buf: buf.subarray(at, at + bytes), length };
    at += bytes;
    return out;
  };
  const payload = (type: number): NbtValue => {
    switch (type) {
      case 1:
        return buf.readInt8(at++);
      case 2:
        at += 2;
        return buf.readInt16BE(at - 2);
      case 3:
        at += 4;
        return buf.readInt32BE(at - 4);
      case 4:
        at += 8;
        return buf.readBigInt64BE(at - 8);
      case 5:
        at += 4;
        return buf.readFloatBE(at - 4);
      case 6:
        at += 8;
        return buf.readDoubleBE(at - 8);
      case 7:
        return arr('byte', 1);
      case 8:
        return str();
      case 9: {
        const t = buf.readUInt8(at++);
        const n = buf.readInt32BE(at);
        at += 4;
        const list: NbtValue[] = [];
        for (let i = 0; i < n; i++) list.push(payload(t));
        return list;
      }
      case 10: {
        const o: NbtCompound = {};
        for (let t = buf.readUInt8(at++); t !== 0; t = buf.readUInt8(at++)) o[str()] = payload(t);
        return o;
      }
      case 11:
        return arr('int', 4);
      case 12:
        return arr('long', 8);
      default:
        throw new Error(`NBT tag ${type}`);
    }
  };
  if (buf.readUInt8(at++) !== 10) throw new Error('NBT root is not a compound');
  str();
  return payload(10) as NbtCompound;
}
