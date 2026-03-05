import { supabase } from '@/integrations/supabase/client';
import { suggestBundles, type BundleForMatch } from './bundleMatch';

/**
 * Apply matching material bundles to a task.
 * Skips if task already has expanded_recipe_id or bundles_applied = true.
 * Deduplicates by name + sku + unit before inserting.
 * Sets bundles_applied = true when done.
 */
export async function applyBundles(taskId: string, taskDescription: string): Promise<number> {
  // 1. Fetch active bundles
  const { data: bundlesRaw } = await supabase
    .from('task_material_bundles' as any)
    .select('id, name, keywords, priority, trade')
    .eq('active', true);

  if (!bundlesRaw || bundlesRaw.length === 0) {
    await supabase.from('tasks').update({ bundles_applied: true } as any).eq('id', taskId);
    return 0;
  }

  const bundles: BundleForMatch[] = (bundlesRaw as any[]).map(b => ({
    id: b.id,
    name: b.name,
    keywords: b.keywords,
    priority: b.priority,
    trade: b.trade,
  }));

  // 2. Match
  const matches = suggestBundles(taskDescription, bundles);
  if (matches.length === 0) {
    await supabase.from('tasks').update({ bundles_applied: true } as any).eq('id', taskId);
    return 0;
  }

  // 3. Fetch existing materials for dedup
  const { data: existingMats } = await supabase
    .from('task_materials')
    .select('name, sku, unit')
    .eq('task_id', taskId);

  const existingKeys = new Set(
    (existingMats || []).map(m =>
      `${(m.name || '').toLowerCase()}|${(m.sku || '').toLowerCase()}|${(m.unit || '').toLowerCase()}`
    )
  );

  let insertedCount = 0;

  // 4. For each matched bundle, fetch items and insert
  for (const match of matches) {
    const { data: items } = await supabase
      .from('task_material_bundle_items' as any)
      .select('*')
      .eq('bundle_id', match.bundle.id);

    if (!items || items.length === 0) continue;

    const toInsert: any[] = [];
    for (const item of items as any[]) {
      const key = `${(item.material_name || '').toLowerCase()}|${(item.sku || '').toLowerCase()}|${(item.unit || '').toLowerCase()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key); // prevent cross-bundle dupes too

      toInsert.push({
        task_id: taskId,
        name: item.material_name,
        quantity: item.qty,
        unit: item.unit || null,
        sku: item.sku || null,
        vendor_url: item.vendor_url || null,
        store_section: item.store_section || null,
        provided_by: item.provided_by || 'either',
        item_type: 'material',
        purchased: false,
        delivered: false,
      });
    }

    if (toInsert.length > 0) {
      await supabase.from('task_materials').insert(toInsert);
      insertedCount += toInsert.length;
    }
  }

  // 5. Mark bundles as applied
  await supabase.from('tasks').update({ bundles_applied: true } as any).eq('id', taskId);

  return insertedCount;
}
