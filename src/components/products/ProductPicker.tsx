import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Plus } from 'lucide-react';
import { Product, useProducts } from '@/hooks/useProductLibrary';
import ProductFormDialog from './ProductFormDialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSelect: (product: Product) => void;
  title?: string;
}

export default function ProductPicker({ open, onOpenChange, onSelect, title = 'Product Library' }: Props) {
  const { data: products = [] } = useProducts();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort(),
    [products]
  );

  const results = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return products
      .filter(p => p.is_active)
      .filter(p => !category || p.category === category)
      .filter(p => {
        if (!words.length) return true;
        const hay = [p.name, p.brand, p.model, p.sku, p.vendor_name, p.category, p.subcategory]
          .filter(Boolean).join(' ').toLowerCase();
        return words.every(w => hay.includes(w));
      })
      .slice(0, 80);
  }, [products, search, category]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Search by name, brand, SKU, vendor…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
          </div>

          {categories.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <Badge variant={category === null ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setCategory(null)}>All</Badge>
              {categories.map(c => (
                <Badge key={c} variant={category === c ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setCategory(c)}>{c}</Badge>
              ))}
            </div>
          )}

          <ScrollArea className="flex-1 -mx-2 px-2" style={{ maxHeight: '45vh' }}>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No matching products.</p>
            ) : (
              <div className="space-y-1.5">
                {results.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left rounded-md border p-2.5 hover:bg-accent transition-colors"
                    onClick={() => { onSelect(p); onOpenChange(false); }}
                  >
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[
                        p.brand,
                        p.unit_cost != null ? `$${p.unit_cost.toFixed(2)}${p.unit ? `/${p.unit}` : ''}` : null,
                        p.vendor_name,
                        p.sku ? `SKU ${p.sku}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          <Button variant="outline" className="gap-1.5" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />Create new product
          </Button>
        </DialogContent>
      </Dialog>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        allProducts={products}
        initialName={search}
        onSaved={(p) => { onSelect(p); onOpenChange(false); }}
      />
    </>
  );
}
