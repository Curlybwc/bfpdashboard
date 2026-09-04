import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface DictateButtonProps {
  listening: boolean;
  supported: boolean;
  toggle: () => void;
  className?: string;
  label?: string;
}

/**
 * Big thumb-friendly dictation toggle for field capture screens.
 */
const DictateButton = ({
  listening,
  supported,
  toggle,
  className,
  label = 'Dictate',
}: DictateButtonProps) => {
  if (!supported) return null;

  return (
    <Button
      type="button"
      onClick={toggle}
      variant={listening ? 'destructive' : 'secondary'}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictation' : 'Start dictation'}
      className={cn('h-12 min-w-[7rem] text-base', className)}
    >
      {listening ? (
        <>
          <Square className="mr-2 h-4 w-4 fill-current" />
          Stop
        </>
      ) : (
        <>
          <Mic className="mr-2 h-5 w-5" />
          {label}
        </>
      )}
    </Button>
  );
};

export default DictateButton;
