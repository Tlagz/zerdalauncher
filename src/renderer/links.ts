import type { ModProvider } from '../shared/types';

/** Public project page; both URL forms redirect to the canonical slug page. */
export function projectUrl(provider: ModProvider, projectId: string, slug?: string): string {
  return provider === 'modrinth'
    ? `https://modrinth.com/project/${slug || projectId}`
    : `https://www.curseforge.com/projects/${projectId}`;
}

/** Opens in the system browser (main process routes window.open to shell.openExternal). */
export function openExternal(url: string): void {
  window.open(url, '_blank');
}
