import { useMemo, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Search, Plus, ExternalLink } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Product, useProducts } from '@/hooks/useProductLibrary';
import ProductFormDialog from '@/components/products/ProductFormDialog';
import ProductDetailSheet from '@/components/products/ProductDetailSheet';

export default function ProductLibrary() {
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [detail, setDetail] = useState<Product | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean) as string[])).sort(),
    [products]
  );

  const filtered = useMemo(() => {
    const words = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
    return products
      .filter(p => showInactive || p.is_active)
      .filter(p => !category || p.category === category)
      .filter(p => {
        if (!words.length) return true;
        const hay = [p.name, p.brand, p.model, p.sku, p.vendor_name, p.category, p.subcategory]
          .filter(Boolean).join(' ').toLowerCase();
        return words.every(w => hay.includes(w));
      });
  }, [products, search, category, showInactive]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['product-library'] });

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader
        title="Product Library"
        actions={
          <Button size="sm" onClick={() => { setEditProduct(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />New
          </Button>
        }
      />

      <main className="p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5 flex-wrap">
            <Badge variant={category === null ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setCategory(null)}>All</Badge>
            {categories.map(c => (
              <Badge key={c} variant={category === c ? 'default' : 'outline'} className="cursor-pointer" onClick={() => setCategory(c)}>{c}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground">Inactive</span>
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{filtered.length} product{filtered.length === 1 ? '' : 's'}</p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No products found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <Card
                key={p.id}
                className={`p-3 cursor-pointer active:bg-accent transition-colors ${!p.is_active ? 'opacity-50' : ''}`}
                onClick={() => setDetail(p)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[p.brand, p.category, p.vendor_name, p.sku ? `SKU ${p.sku}` : null].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{p.unit_cost != null ? `$${p.unit_cost.toFixed(2)}` : '—'}</p>
                    {p.unit && <p className="text-[11px] text-muted-foreground">per {p.unit}</p>}
                  </div>
                  {p.vendor_url && (
                    <a
                      href={p.vendor_url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-muted-foreground hover:text-primary mt-0.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editProduct}
        allProducts={products}
        onSaved={(p) => { refresh(); if (detail) setDetail(p); }}
      />

      <ProductDetailSheet
        product={detail}
        open={!!detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={(p) => { setEditProduct(p); setFormOpen(true); }}
      />
    </div>
  );
}
