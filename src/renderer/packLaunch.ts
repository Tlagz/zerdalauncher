import { confirmDialog, showToast } from './ui/feedback';
import type { Instance } from '../shared/types';

/**
 * Before a pack instance starts: offer the pack's newer version, or demand it
 * when a newer version is marked as required by the server. Resolves false when
 * the player cancels. Network problems never block playing.
 */
export async function ensurePackUpToDate(instance: Instance): Promise<boolean> {
  if (!instance.pack) return true;
  const pack = await window.api.packs
    .list()
    .then((list) => list.find((p) => p.id === instance.pack!.id))
    .catch(() => undefined);
  if (!pack?.versions.length) return true;
  const at = pack.versions.findIndex((v) => v.version === instance.pack!.version);
  const newer = at === -1 ? pack.versions : pack.versions.slice(0, at);
  if (!newer.length) return true;

  const latest = pack.versions[0].version;
  const required = newer.some((v) => v.required);
  const update = await confirmDialog({
    title: required ? 'Wymagana aktualizacja paczki' : 'Nowa wersja paczki',
    message: required
      ? `Serwer wymaga „${pack.name}" w wersji ${latest}, a masz ${instance.pack.version}. Bez aktualizacji nie wejdziesz na serwer.`
      : `Jest „${pack.name}" w wersji ${latest} (masz ${instance.pack.version}). Zaktualizować przed grą?`,
    confirmLabel: 'Aktualizuj i graj',
    cancelLabel: required ? 'Anuluj' : 'Graj bez aktualizacji'
  });
  if (!update) return !required;
  showToast(`Aktualizuję „${pack.name}" do ${latest}…`, 'info');
  await window.api.packs.update(instance.id);
  return true;
}
