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
          <button onClick={() => navigate(backTo)} className="text-muted-foreground hover:text-foreground -ml-1">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="flex-1 text-lg font-semibold truncate">{title}</h1>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
};

export default PageHeader;
