import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth } from 'date-fns';
import type { Shift } from '@/hooks/useShifts';

interface ShiftsCalendarViewProps {
  shifts: Shift[];
  profileMap: Record<string, string>;
  projectMap: Record<string, string>;
  onEditShift: (shift: Pick<Shift, 'id'>) => void;
  onDateClick?: (dateStr: string) => void;
  onMonthChange?: (from: string, to: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ShiftsCalendarView({
  shifts,
  profileMap,
  projectMap,
  onEditShift,
  onMonthChange,
}: ShiftsCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const handleMonthChange = (newMonth: Date) => {
    setCurrentMonth(newMonth);
    const from = format(newMonth, 'yyyy-MM-dd');
    const to = format(endOfMonth(newMonth), 'yyyy-MM-dd');
    onMonthChange?.(from, to);
  };

  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) {
      if (!map[s.shift_date]) map[s.shift_date] = [];
      map[s.shift_date].push(s);
    }
    return map;
  }, [shifts]);

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [currentMonth]);

  const startPadding = getDay(days[0]);

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => handleMonthChange(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold">{format(currentMonth, 'MMMM yyyy')}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => handleMonthChange(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {/* Empty cells for padding */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-muted/30 min-h-[80px] p-1" />
        ))}

        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayShifts = shiftsByDate[dateStr] || [];
          const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');
          const totalHours = dayShifts.reduce((sum, s) => sum + s.total_hours, 0);

          return (
            <div
              key={dateStr}
              className={`bg-background min-h-[80px] p-1 space-y-0.5 ${
                isToday ? 'ring-1 ring-inset ring-primary/50' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-medium leading-none ${
                    isToday
                      ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center'
                      : 'text-foreground'
                  }`}
                >
                  {format(day, 'd')}
                </span>
                {totalHours > 0 && (
                  <span className="text-[9px] font-medium text-muted-foreground">
                    {totalHours}h
                  </span>
                )}
              </div>

              {dayShifts.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onEditShift(s)}
                  className="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {profileMap[s.user_id]?.split(' ')[0] || '?'} · {s.total_hours}h
                </button>
              ))}
              {dayShifts.length > 3 && (
                <p className="text-[9px] text-muted-foreground text-center">
                  +{dayShifts.length - 3} more
                </p>
              )}
            </div>
          );
        })}

        {/* Trailing padding */}
        {Array.from({ length: (7 - ((startPadding + days.length) % 7)) % 7 }).map((_, i) => (
          <div key={`trail-${i}`} className="bg-muted/30 min-h-[80px] p-1" />
        ))}
      </div>
    </div>
  );
}
