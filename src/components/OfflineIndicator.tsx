import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/** Slim banner shown when the device loses connectivity. */
const OfflineIndicator = () => {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-3 py-2 text-sm font-medium text-warning-foreground safe-top"
    >
      <WifiOff className="h-4 w-4" />
      Offline — changes will fail until you reconnect
    </div>
  );
};

export default OfflineIndicator;
