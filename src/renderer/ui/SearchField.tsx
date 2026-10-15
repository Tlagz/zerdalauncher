import { Search } from 'lucide-react';

/** Text input with a leading search icon. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={`search-field ${className}`}>
      <Search size={16} className="search-field-icon" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}
