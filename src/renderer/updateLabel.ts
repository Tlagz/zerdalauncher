import type { UpdateStatus } from '../shared/types';

/** Human-readable launcher self-update status (Settings + Home). */
export function updateLabel(s: UpdateStatus | null): string {
  switch (s?.state) {
    case 'checking':
      return 'Sprawdzam dostępność aktualizacji…';
    case 'available':
      return `Znaleziono wersję ${s.version} — pobieram…`;
    case 'downloading':
      return `Pobieranie aktualizacji… ${s.percent}%`;
    case 'ready':
      return `Wersja ${s.version} gotowa do instalacji.`;
    case 'none':
      return 'Masz najnowszą wersję.';
    case 'disabled':
      return 'Auto-aktualizacje działają tylko w zainstalowanej wersji (nie w trybie dev).';
    case 'error':
      return `Błąd sprawdzania aktualizacji: ${s.message}`;
    default:
      return '';
  }
}
