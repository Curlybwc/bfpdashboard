import { Link, useLocation } from 'react-router-dom';
import { FolderKanban, ClipboardList, LogOut, Shield } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAdmin } from '@/hooks/useAdmin';

const MobileNav = () => {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin } = useAdmin();
  
  const links = [
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
    { to: '/scopes', icon: ClipboardList, label: 'Scopes' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card safe-bottom">
      <div className="flex items-center justify-around py-2">
        {links.map(({ to, icon: Icon, label }) => {
          const active = location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
                active ? 'text-primary font-medium' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
        {isAdmin && (
          <Link
            to="/admin"
            className={`flex flex-col items-center gap-0.5 px-3 py-1 text-xs transition-colors ${
              location.pathname.startsWith('/admin') ? 'text-primary font-medium' : 'text-muted-foreground'
            }`}
          >
            <Shield className="h-5 w-5" />
            Admin
          </Link>
        )}
        <button
          onClick={signOut}
          className="flex flex-col items-center gap-0.5 px-3 py-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>
    </nav>
  );
};

export default MobileNav;
