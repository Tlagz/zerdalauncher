import type { ModProvider } from '../../shared/types';

/** Segmented control to pick the content source (Modrinth / CurseForge). */
export function SourceSwitch({
  value,
  onChange
}: {
  value: ModProvider;
  onChange: (p: ModProvider) => void;
}) {
  return (
    <div className="source-switch" role="tablist" aria-label="Źródło">
      <button
        role="tab"
        aria-selected={value === 'modrinth'}
        className={value === 'modrinth' ? 'active modrinth' : ''}
        onClick={() => onChange('modrinth')}
      >
        <span className="src-dot modrinth" />
        Modrinth
      </button>
      <button
        role="tab"
        aria-selected={value === 'curseforge'}
        className={value === 'curseforge' ? 'active curseforge' : ''}
        onClick={() => onChange('curseforge')}
      >
        <span className="src-dot curseforge" />
        CurseForge
      </button>
    </div>
  );
}
