/**
 * TaskPhotos — Photo-first task documentation (before / progress / after).
 *
 * STORAGE MODEL (v1):
 *   - Bucket: `task-photos` (PUBLIC). Anyone with the file URL can view/download.
 *     This is an intentional simplicity & shareability tradeoff, NOT a privacy-hardened model.
 *   - Upload path: `${taskId}/${phase}/${crypto.randomUUID()}.jpg`
 *   - Storage INSERT policy: any authenticated user may upload to the bucket.
 *     This is deliberately broader than the `task_photos` TABLE INSERT policy
 *     (which requires project membership). The mismatch means orphan files
 *     can exist in storage without a corresponding metadata row — these are
 *     harmless blobs that consume minimal storage.
 *   - Images are compressed client-side (max 1400px edge, JPEG 0.82 quality)
 *     before upload to keep payloads in the 200KB–800KB range.
 */
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Camera, Download, Share2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type PhotoPhase = 'before' | 'progress' | 'after';

interface TaskPhoto {
  id: string;
  task_id: string;
  phase: PhotoPhase;
  storage_path: string;
  caption: string | null;
  uploaded_by: string;
  created_at: string;
}

interface TaskPhotosProps {
  taskId: string;
  photos: TaskPhoto[];
  userId: string;
  onPhotosChange: () => void;
  canUpload: boolean;
}

const PHASES: { key: PhotoPhase; label: string }[] = [
  { key: 'before', label: 'Before' },
  { key: 'progress', label: 'Progress' },
  { key: 'after', label: 'After' },
];

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1400;
      let w = img.width;
      let h = img.height;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
          URL.revokeObjectURL(objectUrl);
        },
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('task-photos').getPublicUrl(path);
  return data.publicUrl;
}

const TaskPhotos = ({ taskId, photos, userId, onPhotosChange, canUpload }: TaskPhotosProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState<PhotoPhase | null>(null);
  const [viewerPhoto, setViewerPhoto] = useState<TaskPhoto | null>(null);

  const handleUpload = async (phase: PhotoPhase, file: File) => {
    setUploading(phase);
    try {
      const compressed = await compressImage(file);
      const path = `${taskId}/${phase}/${crypto.randomUUID()}.jpg`;

      const { error: storageErr } = await supabase.storage
        .from('task-photos')
        .upload(path, compressed, { contentType: 'image/jpeg' });

      if (storageErr) {
        toast({ title: 'Upload failed', description: storageErr.message, variant: 'destructive' });
        return;
      }

      const { error: metaErr } = await supabase.from('task_photos' as any).insert({
        task_id: taskId,
        phase,
        storage_path: path,
        uploaded_by: userId,
      });

      if (metaErr) {
        // Best-effort cleanup
        await supabase.storage.from('task-photos').remove([path]);
        toast({ title: 'Failed to save photo record', description: metaErr.message, variant: 'destructive' });
        return;
      }

      onPhotosChange();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong while uploading';
      toast({ title: 'Upload error', description: message, variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const handleFileChange = (phase: PhotoPhase) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(phase, file);
    e.target.value = '';
  };

  const handleShare = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ url, title: 'Task Photo' });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied to clipboard' });
    }
  };

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Photos</Label>

      {PHASES.map(({ key, label }) => {
        const phasePhotos = photos.filter(p => p.phase === key);
        return (
          <div key={key} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </span>
              {canUpload && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange(key)}
                    disabled={uploading !== null}
                  />
                  <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                    {uploading === key ? 'Uploading…' : 'Add'}
                  </span>
                </label>
              )}
            </div>
            {phasePhotos.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {phasePhotos.map(photo => (
                  <button
                    key={photo.id}
                    onClick={() => setViewerPhoto(photo)}
                    className="shrink-0 rounded-md overflow-hidden border hover:ring-2 ring-primary transition-all"
                  >
                    <img
                      src={getPublicUrl(photo.storage_path)}
                      alt={`${label} photo`}
                      className="h-20 w-20 object-cover"
                      loading="lazy"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No {label.toLowerCase()} photos yet</p>
            )}
          </div>
        );
      })}

      {/* Photo viewer dialog */}
      <Dialog open={!!viewerPhoto} onOpenChange={(open) => { if (!open) setViewerPhoto(null); }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="capitalize">{viewerPhoto?.phase} Photo</DialogTitle>
          </DialogHeader>
          {viewerPhoto && (
            <div className="flex flex-col">
              <img
                src={getPublicUrl(viewerPhoto.storage_path)}
                alt="Task photo"
                className="w-full max-h-[60vh] object-contain bg-muted"
              />
              <div className="p-4 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {new Date(viewerPhoto.created_at).toLocaleString()}
                </p>
                <div className="flex gap-2">
                  <a
                    href={getPublicUrl(viewerPhoto.storage_path)}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleShare(getPublicUrl(viewerPhoto.storage_path))}
                  >
                    <Share2 className="h-4 w-4 mr-1" />
                    Share
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskPhotos;
