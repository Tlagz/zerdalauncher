import { getJson } from './utils/http';
import type { McNewsEntry, McPatchNotes } from '../shared/types';

const MOJANG = 'https://launchercontent.mojang.com';

interface FeedEntry {
  title: string;
  version: string;
  type: 'release' | 'snapshot';
  image?: { url: string };
  contentPath: string;
  date: string;
  shortText: string;
}

let cache: { at: number; entries: McNewsEntry[] } | null = null;
const TTL = 30 * 60 * 1000;

const toEntry = (e: FeedEntry): McNewsEntry => ({
  title: e.title,
  version: e.version,
  type: e.type,
  date: e.date,
  shortText: e.shortText,
  image: e.image?.url ? MOJANG + e.image.url : undefined,
  contentPath: e.contentPath
});

/**
 * Newest Java Edition release, plus the newest snapshot when it's newer than
 * that release — from the feed the official launcher uses.
 */
export async function minecraftNews(): Promise<McNewsEntry[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.entries;
  const feed = await getJson<{ entries: FeedEntry[] }>(`${MOJANG}/v2/javaPatchNotes.json`);
  const sorted = [...feed.entries].sort((a, b) => b.date.localeCompare(a.date));
  const release = sorted.find((e) => e.type === 'release');
  const snapshot = sorted.find((e) => e.type === 'snapshot');
  const entries = [release, snapshot && (!release || snapshot.date > release.date) ? snapshot : undefined]
    .filter((e): e is FeedEntry => !!e)
    .map(toEntry);
  cache = { at: Date.now(), entries };
  return entries;
}

/** Full patch notes; `contentPath` must come from the feed (a plain relative JSON path). */
export async function minecraftPatchNotes(contentPath: string): Promise<McPatchNotes> {
  if (!/^javaPatchNotes\/[\w.-]+\.json$/.test(contentPath)) throw new Error('Nieprawidłowa ścieżka.');
  const n = await getJson<{ title: string; version: string; body: string; image?: { url: string } }>(
    `${MOJANG}/v2/${contentPath}`
  );
  return { title: n.title, version: n.version, body: n.body, image: n.image?.url ? MOJANG + n.image.url : undefined };
}
