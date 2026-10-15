import { useIndicator } from '../ui/useIndicator';
import type { ModProvider } from '../../shared/types';

const OPTIONS: Array<{ id: ModProvider; label: string }> = [
  { id: 'modrinth', label: 'Modrinth' },
  { id: 'curseforge', label: 'CurseForge' }
];

/** Segmented control to pick the content source (Modrinth / CurseForge). */
export function SourceSwitch({
  value,
  onChange
}: {
  value: ModProvider;
  onChange: (p: ModProvider) => void;
}) {
  const indicator = useIndicator<HTMLDivElement>(value);

  return (
    <div className="source-switch" role="tablist" aria-label="Źródło" ref={indicator.ref}>
      <span
        className={`slide-indicator source-indicator ${value} ${indicator.ready ? 'ready' : ''}`}
        style={indicator.style}
        aria-hidden
      />
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          data-active={value === o.id}
          className={value === o.id ? `active ${o.id}` : ''}
          onClick={() => onChange(o.id)}
        >
          <span className={`src-dot ${o.id}`} />
          {o.label}
        </button>
      ))}
    </div>
  );
}
