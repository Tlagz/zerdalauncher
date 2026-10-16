import type { LucideIcon } from 'lucide-react';
import { useIndicator } from './useIndicator';

/** Segmented control with a sliding active pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: LucideIcon }>;
  onChange: (v: T) => void;
}) {
  const indicator = useIndicator<HTMLDivElement>(value);
  return (
    <div className="segmented" role="radiogroup" ref={indicator.ref}>
      <span
        className={`slide-indicator segmented-indicator ${indicator.ready ? 'ready' : ''}`}
        style={indicator.style}
        aria-hidden
      />
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          data-active={v === value}
          className={v === value ? 'active' : ''}
          onClick={() => onChange(v)}
        >
          {Icon && <Icon size={14} />}
          {label}
        </button>
      ))}
    </div>
  );
}
