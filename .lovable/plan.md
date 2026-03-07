

## Plan: Photo-First Task Update Workflow + Download/Share

### Migration SQL

Create `task_photos` table and `task-photos` public storage bucket with RLS:

```sql
-- Public storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('task-photos', 'task-photos', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload task photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-photos');

CREATE POLICY "Anyone can view task photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'task-photos');

CREATE POLICY "Admins can delete task photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-photos' AND is_admin(auth.uid()));

-- task_photos table
CREATE TABLE public.task_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  phase text NOT NULL CHECK (phase IN ('before', 'progress', 'after')),
  storage_path text NOT NULL,
  caption text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.task_photos ENABLE ROW LEVEL SECURITY;

-- RLS: view if admin or project member
CREATE POLICY "View task photos"
ON public.task_photos FOR SELECT TO authenticated
USING (
  is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM tasks t WHERE t.id = task_photos.task_id AND is_project_member(auth.uid(), t.project_id)
  )
);

-- RLS: insert if admin or contractor/manager on project
CREATE POLICY "Insert task photos"
ON public.task_photos FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid() AND (
    is_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM tasks t WHERE t.id = task_photos.task_id
      AND get_project_role(auth.uid(), t.project_id) IN ('manager', 'contractor')
    )
  )
);

-- RLS: delete admin only
CREATE POLICY "Delete task photos"
ON public.task_photos FOR DELETE TO authenticated
USING (is_admin(auth.uid()));
```

### Files Changed

| File | Change |
|------|--------|
| `src/components/TaskPhotos.tsx` | **New** — grouped photo sections with client-side compression, upload, enlarged viewer with Download + Share (Web Share API with clipboard fallback) |
| `src/pages/TaskDetail.tsx` | Add photo state, fetch, upload handler with error handling + cleanup, place `<TaskPhotos/>` after blocker card, toast nudges on Start/Complete |
| `src/components/TaskCard.tsx` | Add `photoCount?: number` prop, show 📷 icon when > 0 |
| `src/components/NextUpCard.tsx` | Pass through `photoCount` prop |
| `src/hooks/useProjectDetail.ts` | Batch-fetch photo counts after tasks load, return `photoCountMap` |
| `src/pages/ProjectDetail.tsx` | Pass `photoCount` from batch map into TaskCard instances |
| `src/pages/Today.tsx` | Batch-fetch photo counts for all displayed tasks, pass into TaskCard and NextUpCard |

### Key Implementation Details

**Client-side compression** (in TaskPhotos.tsx):
- Canvas-based resize: max 1400px longest edge, JPEG quality 0.82
- Typical output 200KB–800KB
- Uses `createImageBitmap` with `Image` fallback

**Upload handler** (in TaskDetail.tsx):
- Path: `${taskId}/${phase}/${crypto.randomUUID()}.jpg`
- If storage upload fails → toast error, stop
- If metadata insert fails → attempt `storage.remove([path])`, toast error
- On success → re-fetch photos

**Photo viewer dialog** (in TaskPhotos.tsx):
- Tap thumbnail → Dialog with large image, caption, timestamp
- **Download** button: `<a href={publicUrl} download>` 
- **Share** button: `navigator.share({ url })` on mobile, clipboard fallback on desktop

**Batch photo counts**:
- `useProjectDetail`: after tasks load, query `task_photos.select('task_id').in('task_id', taskIds)`, build count map
- `Today.tsx`: same pattern after all task lists assembled
- Pass `photoCount` prop down — no per-card queries

**Toast nudges**:
- `handleStart`: if no "before" photos → toast "Add a before photo to document starting conditions"
- `handleComplete`: if no "after" photos → toast "Add an after photo to document completed work"
- Non-blocking, informational only

### Implementation Notes
- **Public bucket (v1)**: Task photos are stored in a public storage bucket. Anyone with the file URL can view the image. This is an intentional simplicity tradeoff, not a hardened privacy model. The `task_photos` metadata table still has project-membership RLS, so the app UI only surfaces photos to authorized users.
- **No user-facing delete** in v1 — admin can remove via backend
- **Orphan cleanup** on metadata insert failure is best-effort; if cleanup fails, orphan file remains harmlessly
- **No image editing/cropping** — native camera/file picker only
- **Compression uses canvas API** — works in all modern mobile browsers

