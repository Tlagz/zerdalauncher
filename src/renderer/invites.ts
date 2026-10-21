import { useStore } from './store';

// Invites already offered (or made here) survive restarts, so an old link left
// in the clipboard doesn't pop up every time the launcher starts or gets focus.
const KEY = 'invites.seen';
const MAX = 100;

/** Short stable id for a link (FNV-1a), so storage doesn't hold whole links. */
function hash(link: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < link.length; i++) {
    h ^= link.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function load(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const seen = new Set<string>(load());

/** Remember a link so the clipboard check ignores it from now on. */
export function markInviteSeen(link: string): void {
  const h = hash(link);
  if (seen.has(h)) return;
  seen.add(h);
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen].slice(-MAX)));
  } catch {
    /* storage unavailable — this session still remembers it */
  }
}

/**
 * Discord doesn't make zerda:// links clickable, so when the launcher gets
 * focus with a new invite in the clipboard, offer it once. Pass `manual` to
 * show it again on purpose (Ctrl+K action).
 */
export async function checkClipboardInvite(manual = false): Promise<boolean> {
  const found = await window.api.invites.fromClipboard().catch(() => null);
  if (!found || (!manual && seen.has(hash(found.link)))) return false;
  markInviteSeen(found.link);
  useStore.setState({ invite: found });
  return true;
}
