import { useStore } from './store';

// Links already offered (or made here), so focusing the launcher doesn't re-prompt.
const seen = new Set<string>();

/** Remember a link so the clipboard check ignores it (e.g. one the user just created). */
export function markInviteSeen(link: string): void {
  seen.add(link);
}

/**
 * Discord doesn't make zerda:// links clickable, so when the launcher gets
 * focus with an invite in the clipboard, offer it. Pass `manual` to report
 * when nothing was found (Ctrl+K action).
 */
export async function checkClipboardInvite(manual = false): Promise<boolean> {
  const found = await window.api.invites.fromClipboard().catch(() => null);
  if (!found || (!manual && seen.has(found.link))) return false;
  seen.add(found.link);
  useStore.setState({ invite: found });
  return true;
}
