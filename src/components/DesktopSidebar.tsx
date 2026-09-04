import { Link, useLocation } from 'react-router-dom';
import {
  FolderKanban,
  ClipboardList,
  LogOut,
  Shield,
  CalendarCheck,
  ShoppingCart,
  Receipt,
  Clock,
  CalendarDays,
  Package,
  Boxes,
  Wrench,
  DollarSign,
  BarChart3,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalPermissions } from '@/hooks/useAdmin';
import { cn } from '@/lib/utils';

type Item = { to: string; icon: any; label: string; exact?: boolean };
type Group = { title: string; items: Item[] };

/**
 * Persistent desktop navigation (lg and up only).
 * The bottom tab bar stays for mobile/tablet; this replaces it on larger screens
 * so desktop keeps a dense, always-visible navigation instead of a phone tab bar.
 */
const DesktopSidebar = () => {
  const location = useLocation();
  const { signOut } = useAuth();
  const { isAdmin, canManageProjects } = useGlobalPermissions();
  const isContractor = !isAdmin && !canManageProjects;

  const groups: Group[] = [
    {
      title: 'Work',
      items: [
        { to: '/today', icon: CalendarCheck, label: 'Today' },
        { to: '/projects', icon: FolderKanban, label: 'Projects' },
        ...(!isContractor
          ? [
              { to: '/scopes', icon: ClipboardList, label: 'Scopes' },
              { to: '/today/field-mode', icon: Zap, label: 'Field mode' },
            ]
          : []),
        { to: '/shopping', icon: ShoppingCart, label: 'Shopping list' },
      ],
    },
    {
      title: 'Me',
      items: [
        { to: '/shifts', icon: Clock, label: 'Shifts' },
        { to: '/reimbursements', icon: Receipt, label: 'Receipts' },
        { to: '/availability', icon: CalendarDays, label: 'Availability' },
        { to: '/products', icon: Package, label: 'Product library' },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: 'Manage',
            items: [
              { to: '/admin/calendar', icon: CalendarDays, label: 'Calendar' },
              { to: '/admin/inventory/materials', icon: Boxes, label: 'Materials inventory' },
              { to: '/admin/inventory/tools', icon: Wrench, label: 'Tools' },
              { to: '/payroll', icon: DollarSign, label: 'Payroll' },
              { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
              { to: '/admin', icon: Shield, label: 'Admin' },
            ],
          },
        ]
      : []),
  ];

  const isActive = (to: string) =>
    to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(to);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card lg:flex">
      <div className="px-4 py-4">
        <Link to="/today" className="text-lg font-semibold tracking-tight">
          BFP Dashboard
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      isActive(to)
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-2">
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
};

export default DesktopSidebar;
