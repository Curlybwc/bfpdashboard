import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

export interface LibraryMaterial {
  id: string;
  name: string;
  normalized_name: string;
  sku: string | null;
  vendor_url: string | null;
  unit_cost: number | null;
  unit: string | null;
  store_section: string | null;
}

interface MaterialAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: LibraryMaterial) => void;
  onAddToLibrary?: (name: string) => void;
  placeholder?: string;
  className?: string;
}

export default function MaterialAutocomplete({
  value, onChange, onSelect, onAddToLibrary, placeholder = 'Name *', className,
}: MaterialAutocompleteProps) {
  const [library, setLibrary] = useState<LibraryMaterial[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('material_library')
      .select('id, name, normalized_name, sku, vendor_url, unit_cost, unit, store_section')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setLibrary(data as LibraryMaterial[]);
      });
  }, []);

  const suggestions = useMemo(() => {
    if (!value.trim() || value.trim().length < 2) return [];
    const q = value.toLowerCase().trim();
    return library
      .filter(m => m.normalized_name.includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [value, library]);

  const exactMatch = useMemo(() => {
    if (!value.trim()) return false;
    const q = value.toLowerCase().trim().replace(/\s+/g, ' ');
    return library.some(m => m.normalized_name === q);
  }, [value, library]);

  const showDropdown = focused && value.trim().length >= 2 && (suggestions.length > 0 || (!exactMatch && onAddToLibrary));

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <Input
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => { setFocused(true); setOpen(true); }}
        className="w-full"
        autoComplete="off"
      />
      {showDropdown && open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {suggestions.map(item => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
              onMouseDown={e => {
                e.preventDefault();
                onChange(item.name);
                onSelect(item);
                setOpen(false);
              }}
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {item.unit_cost != null ? `$${item.unit_cost.toFixed(2)}` : ''}
                {item.unit ? `/${item.unit}` : ''}
                {item.sku ? ` · ${item.sku}` : ''}
              </span>
            </button>
          ))}
          {!exactMatch && onAddToLibrary && value.trim().length >= 2 && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-1.5 text-primary"
              onMouseDown={e => {
                e.preventDefault();
                onAddToLibrary(value.trim());
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add "{value.trim()}" to library
            </button>
          )}
        </div>
      )}
    </div>
  );
}
