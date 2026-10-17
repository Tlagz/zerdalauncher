import net from 'net';
import dns from 'dns/promises';
import type { ServerPing } from '../../shared/types';

// Minecraft "Server List Ping": handshake → status request → JSON, then ping → pong for latency.

function varint(n: number): Buffer {
  const out: number[] = [];
  let v = n >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

function readVarint(buf: Buffer, at: number): { value: number; next: number } | null {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (at + i >= buf.length) return null;
    const b = buf[at + i];
    value |= (b & 0x7f) << (7 * i);
    if (!(b & 0x80)) return { value, next: at + i + 1 };
  }
  throw new Error('bad varint');
}

const packet = (id: number, ...parts: Buffer[]) => {
  const body = Buffer.concat([varint(id), ...parts]);
  return Buffer.concat([varint(body.length), body]);
};
const mcString = (s: string) => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
};

/** "host", "host:port" or "[v6]:port" → host + port (port 0 = not given). */
export function splitAddress(address: string): { host: string; port: number } {
  const a = address.trim();
  const v6 = a.match(/^\[(.+)\](?::(\d+))?$/);
  if (v6) return { host: v6[1], port: Number(v6[2] ?? 0) };
  const m = a.match(/^([^:]+)(?::(\d+))?$/);
  return m ? { host: m[1], port: Number(m[2] ?? 0) } : { host: a, port: 0 };
}

/** Flatten a chat component (string or {text, extra}) and drop § formatting codes. */
function chatText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (!c || typeof c !== 'object') return '';
  const o = c as { text?: string; extra?: unknown[]; translate?: string };
  return (o.text ?? o.translate ?? '') + (o.extra ?? []).map(chatText).join('');
}
const stripCodes = (s: string) => s.replace(/§./g, '').trim();

export async function pingServer(address: string, timeoutMs = 5000): Promise<ServerPing> {
  let { host, port } = splitAddress(address);
  // Like the game: a bare hostname may point elsewhere via an SRV record.
  if (!port && !net.isIP(host)) {
    try {
      const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
      if (srv) {
        host = srv.name;
        port = srv.port;
      }
    } catch {
      /* no SRV record */
    }
  }
  port ||= 25565;

  return new Promise<ServerPing>((resolve) => {
    const sock = net.connect({ host, port });
    let buf = Buffer.alloc(0);
    let status: ServerPing | null = null;
    let pingSent = 0;
    const done = (r: ServerPing) => {
      clearTimeout(timer);
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done(status ?? { online: false, error: 'Przekroczono czas odpowiedzi' }), timeoutMs);

    sock.on('connect', () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      sock.write(packet(0x00, varint(767), mcString(host), portBuf, varint(1)));
      sock.write(packet(0x00));
      pingSent = Date.now();
    });
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      try {
        for (;;) {
          const len = readVarint(buf, 0);
          if (!len || buf.length < len.next + len.value) return;
          const body = buf.subarray(len.next, len.next + len.value);
          buf = buf.subarray(len.next + len.value);
          const id = readVarint(body, 0)!;
          if (id.value === 0x00 && !status) {
            const strLen = readVarint(body, id.next)!;
            const json = JSON.parse(body.subarray(strLen.next, strLen.next + strLen.value).toString('utf8'));
            status = {
              online: true,
              latency: Date.now() - pingSent,
              players: json.players ? { online: json.players.online ?? 0, max: json.players.max ?? 0 } : undefined,
              version: json.version?.name ? stripCodes(String(json.version.name)) : undefined,
              motd: stripCodes(chatText(json.description)),
              favicon: typeof json.favicon === 'string' && json.favicon.startsWith('data:image/') ? json.favicon : undefined
            };
            const payload = Buffer.alloc(8);
            payload.writeBigInt64BE(BigInt(Date.now()));
            pingSent = Date.now();
            sock.write(packet(0x01, payload));
          } else if (id.value === 0x01 && status) {
            done({ ...status, latency: Date.now() - pingSent });
          }
        }
      } catch {
        done(status ?? { online: false, error: 'Nieprawidłowa odpowiedź serwera' });
      }
    });
    sock.on('error', (e: NodeJS.ErrnoException) =>
      done(status ?? { online: false, error: e.code === 'ENOTFOUND' ? 'Nie znaleziono adresu' : 'Serwer nie odpowiada' })
    );
    sock.on('close', () => done(status ?? { online: false, error: 'Serwer zamknął połączenie' }));
  });
}
