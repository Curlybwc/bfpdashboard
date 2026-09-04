import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  backTo?: string;
  actions?: ReactNode;
}

const PageHeader = ({ title, backTo, actions }: PageHeaderProps) => {
  const navigate = useNavigate();

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
          <div className="scroll-x flex max-w-[60%] items-center gap-2 sm:max-w-none [&>*]:shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
};

export default PageHeader;
