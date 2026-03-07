import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

interface DailyRemindersProps {
  showShiftReminder: boolean;
  onLogShift: () => void;
}

const DailyReminders = ({ showShiftReminder, onLogShift }: DailyRemindersProps) => {
  if (!showShiftReminder) return null;

  return (
    <div className="space-y-2">
      {showShiftReminder && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20 px-3 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Clock className="h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <span className="text-sm text-foreground truncate">
              You haven't logged a shift today
            </span>
          </div>
          <Button size="sm" variant="outline" className="shrink-0" onClick={onLogShift}>
            Log Shift
          </Button>
        </div>
      )}
    </div>
  );
};

export default DailyReminders;
