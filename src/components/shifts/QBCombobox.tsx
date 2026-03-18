import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface QBComboboxOption {
  value: string;
  label: string;
  detail?: string;
}

interface QBComboboxProps {
  options: QBComboboxOption[];
  value: string | undefined;
  onSelect: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export default function QBCombobox({ options, value, onSelect, placeholder = 'Search…', className }: QBComboboxProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(() => {
    const opt = options.find((o) => o.value === value);
    return opt ? (opt.detail ? `${opt.label} (${opt.detail})` : opt.label) : '';
  }, [options, value]);

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return options.filter((o) => {
      const text = `${o.label} ${o.detail || ''}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [options, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <Input
        className="h-7 text-xs"
        placeholder={value ? selectedLabel : placeholder}
        value={open ? search : (value ? selectedLabel : '')}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">No matches</p>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(opt.value);
                  setOpen(false);
                  setSearch('');
                }}
              >
                {opt.value === value && <Check className="h-3 w-3 text-primary shrink-0" />}
                <span className={opt.value === value ? 'font-medium' : ''}>
                  {opt.label}
                  {opt.detail && <span className="text-muted-foreground ml-1">({opt.detail})</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
