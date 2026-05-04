import { useEffect, useState } from 'react';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import { getSignedReceiptUrl } from '@/lib/uploadReceipts';

export function ReceiptViewer({ reimbursementId, paths }: { reimbursementId: string; paths: string[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const out: Record<string, string> = {};
      for (const p of paths) {
        const url = await getSignedReceiptUrl(reimbursementId, p);
        if (url) out[p] = url;
      }
      if (!cancelled) { setUrls(out); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [reimbursementId, paths.join('|')]); // eslint-disable-line

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading receipts…</div>;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {paths.map((p) => {
        const url = urls[p];
        if (!url) return <div key={p} className="text-xs text-destructive">Failed to load</div>;
        const isPdf = /\.pdf$/i.test(p);
        return (
          <a key={p} href={url} target="_blank" rel="noreferrer" className="block rounded border overflow-hidden hover:opacity-80">
            {isPdf ? (
              <div className="aspect-square flex flex-col items-center justify-center bg-muted text-muted-foreground gap-1">
                <FileText className="h-8 w-8" />
                <span className="text-xs flex items-center gap-1">PDF <ExternalLink className="h-3 w-3" /></span>
              </div>
            ) : (
              <img src={url} alt="receipt" className="aspect-square object-cover w-full" />
            )}
          </a>
        );
      })}
    </div>
  );
}