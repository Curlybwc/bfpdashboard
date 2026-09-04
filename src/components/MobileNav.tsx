import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  FolderKanban,
  ClipboardList,
  LogOut,
  Shield,
  CalendarCheck,
  ShoppingCart,
  Receipt,
  Plus,
  MoreHorizontal,
  Clock,
  CalendarDays,
  Package,
  Boxes,
  Wrench,
  DollarSign,
  Zap,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalPermissions } from '@/hooks/useAdmin';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type Item = { to: string; icon: any; label: string };

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { isAdmin, canManageProjects } = useGlobalPermissions();
  const isContractor = !isAdmin && !canManageProjects;

  const [moreOpen, setMoreOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const primary: Item[] = [
    { to: '/today', icon: CalendarCheck, label: 'Today' },
    { to: '/projects', icon: FolderKanban, label: 'Projects' },
  ];
  const secondaryPrimary: Item[] = [{ to: '/shopping', icon: ShoppingCart, label: 'Shopping' }];

  const moreItems: Item[] = [
    ...(!isContractor ? [{ to: '/scopes', icon: ClipboardList, label: 'Scopes' }] : []),
    { to: '/shifts', icon: Clock, label: 'Shifts' },
    { to: '/reimbursements', icon: Receipt, label: 'Receipts' },
    { to: '/availability', icon: CalendarDays, label: 'Availability' },
    { to: '/products', icon: Package, label: 'Product Library' },
    ...(isAdmin
      ? [
          { to: '/admin/calendar', icon: CalendarDays, label: 'Calendar' },
          { to: '/admin/inventory/materials', icon: Boxes, label: 'Materials Inventory' },
          { to: '/admin/inventory/tools', icon: Wrench, label: 'Tools' },
          { to: '/payroll', icon: DollarSign, label: 'Payroll' },
          { to: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
          { to: '/admin', icon: Shield, label: 'Admin' },
        ]
      : []),
  ];

  const addActions: Item[] = [
    { to: '/shifts', icon: Clock, label: 'Log a shift' },
    { to: '/projects', icon: FolderKanban, label: 'Add a task (pick project)' },
    { to: '/reimbursements', icon: Receipt, label: 'Submit a receipt' },
    ...(!isContractor ? [{ to: '/today/field-mode', icon: Zap, label: 'Field mode capture' }] : []),
  ];

  const tabClass = (active: boolean) =>
    cn(
      'flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[11px] leading-tight transition-colors',
      active ? 'text-primary font-semibold' : 'text-muted-foreground',
    );

  const go = (to: string, close: () => void) => {
    close();
    navigate(to);
  };

  const isMoreActive = moreItems.some((i) => location.pathname.startsWith(i.to));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-card safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-between gap-0.5 px-1 py-1">
          {primary.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={tabClass(location.pathname.startsWith(to))} aria-label={label}>
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}

          <button
            onClick={() => setAddOpen(true)}
            aria-label="Quick add"
            className="flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight text-primary"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
              <Plus className="h-5 w-5" />
            </span>
            Add
          </button>

          {secondaryPrimary.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className={tabClass(location.pathname.startsWith(to))} aria-label={label}>
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          ))}

          <button onClick={() => setMoreOpen(true)} aria-label="More" className={tabClass(isMoreActive)}>
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl safe-bottom">
          <SheetHeader className="text-left">
            <SheetTitle>Quick add</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-2">
            {addActions.map(({ to, icon: Icon, label }) => (
              <button
                key={label}
                onClick={() => go(to, () => setAddOpen(false))}
                className="flex min-h-[52px] items-center gap-3 rounded-lg border bg-card px-4 text-left text-base"
              >
                <Icon className="h-5 w-5 text-primary" />
                {label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl safe-bottom">
          <SheetHeader className="text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {moreItems.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => go(to, () => setMoreOpen(false))}
                className="flex min-h-[64px] flex-col items-start justify-center gap-1 rounded-lg border bg-card p-3 text-left text-sm"
              >
                <Icon className="h-5 w-5 text-primary" />
                <span className="leading-tight">{label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setMoreOpen(false);
              signOut();
            }}
            className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-lg border text-base text-destructive"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default MobileNav;
