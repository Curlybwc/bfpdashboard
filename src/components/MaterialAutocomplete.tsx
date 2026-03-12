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

export interface LibraryTool {
  id: string;
  name: string;
  sku: string | null;
  vendor_url: string | null;
}

interface MaterialAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: LibraryMaterial) => void;
  onAddToLibrary?: (name: string) => void;
  placeholder?: string;
  className?: string;
  /** When 'tool', searches tool_types instead of material_library */
  itemType?: 'material' | 'tool';
  onSelectTool?: (item: LibraryTool) => void;
}

export default function MaterialAutocomplete({
  value, onChange, onSelect, onAddToLibrary, placeholder, className,
  itemType = 'material', onSelectTool,
}: MaterialAutocompleteProps) {
  const [library, setLibrary] = useState<LibraryMaterial[]>([]);
  const [toolLibrary, setToolLibrary] = useState<LibraryTool[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isTool = itemType === 'tool';
  const defaultPlaceholder = isTool ? 'Tool name *' : 'Name *';

  useEffect(() => {
    if (isTool) {
      supabase
        .from('tool_types')
        .select('id, name, sku, vendor_url')
        .eq('is_active', true)
        .order('name')
        .then(({ data }) => {
          if (data) setToolLibrary(data as LibraryTool[]);
        });
    } else {
      supabase
        .from('material_library')
        .select('id, name, normalized_name, sku, vendor_url, unit_cost, unit, store_section')
        .eq('is_active', true)
        .order('name')
        .then(({ data }) => {
          if (data) setLibrary(data as LibraryMaterial[]);
        });
    }
  }, [isTool]);

  const suggestions = useMemo(() => {
    if (!value.trim() || value.trim().length < 2) return [];
    const q = value.toLowerCase().trim();
    if (isTool) {
      return toolLibrary
        .filter(t => t.name.toLowerCase().includes(q))
        .slice(0, 8);
    }
    return library
      .filter(m => m.normalized_name.includes(q) || m.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [value, library, toolLibrary, isTool]);

  const exactMatch = useMemo(() => {
    if (!value.trim()) return false;
    const q = value.toLowerCase().trim().replace(/\s+/g, ' ');
    if (isTool) {
      return toolLibrary.some(t => t.name.toLowerCase().trim() === q);
    }
    return library.some(m => m.normalized_name === q);
  }, [value, library, toolLibrary, isTool]);

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
        placeholder={placeholder || defaultPlaceholder}
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
                if (isTool && onSelectTool) {
                  onSelectTool(item as LibraryTool);
                } else if (!isTool) {
                  onSelect(item as LibraryMaterial);
                }
                setOpen(false);
              }}
            >
              <span className="font-medium">{item.name}</span>
              {!isTool && (
                <span className="text-xs text-muted-foreground ml-2">
                  {(item as LibraryMaterial).unit_cost != null ? `$${(item as LibraryMaterial).unit_cost!.toFixed(2)}` : ''}
                  {(item as LibraryMaterial).unit ? `/${(item as LibraryMaterial).unit}` : ''}
                  {item.sku ? ` · ${item.sku}` : ''}
                </span>
              )}
              {isTool && item.sku && (
                <span className="text-xs text-muted-foreground ml-2">{item.sku}</span>
              )}
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
              Add "{value.trim()}" to {isTool ? 'Tool Types' : 'library'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
