import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { pipeline } from 'stream/promises';

export async function getJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function postJson<T>(
  url: string,
  body: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function downloadFile(
  url: string,
  dest: string,
  expectedSha1?: string
): Promise<void> {
  if (expectedSha1 && fs.existsSync(dest)) {
    const actual = await sha1File(dest);
    if (actual === expectedSha1) return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> ${res.status}`);
  const tmp = dest + '.part';
  await pipeline(res.body, fs.createWriteStream(tmp));
  fs.renameSync(tmp, dest);
}

/** Fetch a binary resource and return it as a data: URL (or null on failure). */
export async function fetchAsDataUrl(url: string, mime = 'image/png'): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export function sha1File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
