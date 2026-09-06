import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Shift } from '@/hooks/useShifts';

interface Props {
  dateStr: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shifts: Shift[];
  profileMap: Record<string, string>;
  projectMap: Record<string, string>;
  paidShiftIds: Set<string>;
  onSelectShift: (shift: Shift) => void;
  onAddShift: (dateStr: string) => void;
}

export default function ShiftDaySheet({
  dateStr, open, onOpenChange, shifts, profileMap, projectMap, paidShiftIds, onSelectShift, onAddShift,
}: Props) {
  const totalHours = shifts.reduce((sum, s) => sum + Number(s.total_hours ?? 0), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto md:max-w-md md:ml-auto md:h-full md:max-h-full">
        {dateStr && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-base">{format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')}</SheetTitle>
              <SheetDescription>
                {shifts.length === 0
                  ? 'No shifts on this date.'
                  : `${shifts.length} shift${shifts.length !== 1 ? 's' : ''} · ${totalHours}h total`}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-2">
              {shifts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelectShift(s)}
                  className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors flex items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{profileMap[s.user_id] || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {s.project_id ? (projectMap[s.project_id] || 'Unknown project') : 'Unassigned'}
                      {s.start_time && s.end_time ? ` · ${s.start_time.slice(0, 5)} – ${s.end_time.slice(0, 5)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {paidShiftIds.has(s.id) ? (
                      <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Paid</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">Unpaid</Badge>
                    )}
                    <span className="text-sm font-medium">
                      {s.is_flat_rate ? `$${Number(s.flat_rate_amount || 0).toFixed(2)}` : `${Number(s.total_hours ?? 0)}h`}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}

              <Button variant="outline" className="w-full gap-1.5" onClick={() => onAddShift(dateStr)}>
                <Plus className="h-4 w-4" /> Add shift on this day
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
