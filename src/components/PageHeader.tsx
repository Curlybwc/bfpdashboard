import { ArrowLeft, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReactNode, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  actions?: ReactNode;
}

const PageHeader = ({ title, backTo, actions }: PageHeaderProps) => {
  const navigate = useNavigate();
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="flex items-center gap-3 px-4 py-3">
        {backTo && (
          <button
            onClick={() => navigate(backTo)}
            aria-label="Back"
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
        {actions && (
          <>
            {/* Desktop / tablet: inline actions, scrollable if needed */}
            <div className="scroll-x hidden max-w-[60%] items-center gap-2 sm:flex sm:max-w-none [&>*]:shrink-0">
              {actions}
            </div>
            {/* Phone: collapse actions into a sheet to keep the header to one row */}
            <button
              onClick={() => setActionsOpen(true)}
              aria-label="More actions"
              className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground sm:hidden"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {actions && (
        <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl safe-bottom sm:hidden">
            <SheetHeader className="text-left">
              <SheetTitle>{title}</SheetTitle>
            </SheetHeader>
            <div
              className="mt-4 grid gap-2 [&_button]:min-h-[48px] [&_button]:w-full [&_button]:justify-start"
              onClick={(e) => {
                // Close the sheet after any action button inside is tapped
                if ((e.target as HTMLElement).closest('button, a')) setActionsOpen(false);
              }}
            >
              {actions}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </header>
  );
};

export default PageHeader;
