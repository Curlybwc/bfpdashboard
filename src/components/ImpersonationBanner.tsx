import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ImpersonationBanner = () => {
  const { user } = useAuth();
  const [impersonating, setImpersonating] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    // Check URL for impersonation flag on mount
    const params = new URLSearchParams(window.location.search);
    if (params.get('impersonating') === 'true') {
      sessionStorage.setItem('impersonating', 'true');
      // Clean the URL
      params.delete('impersonating');
      const clean = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (clean ? `?${clean}` : ''));
    }
    if (sessionStorage.getItem('impersonating') === 'true') {
      setImpersonating(true);
    }
  }, []);

  useEffect(() => {
    if (!impersonating || !user) return;
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setDisplayName(data?.full_name || user.email || 'this user'));
  }, [impersonating, user]);

  const handleEnd = async () => {
    sessionStorage.removeItem('impersonating');
    await supabase.auth.signOut();
    window.close();
    // Fallback if window.close() is blocked
    window.location.href = '/login';
  };

  if (!impersonating || !user) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-destructive px-4 py-2 text-destructive-foreground text-sm font-medium">
      <span>Viewing as <strong>{displayName}</strong></span>
      <Button
        size="sm"
        variant="secondary"
        className="h-7 gap-1.5 text-xs"
        onClick={handleEnd}
      >
        <LogOut className="h-3.5 w-3.5" />
        End Impersonation
      </Button>
    </div>
  );
};

export default ImpersonationBanner;
