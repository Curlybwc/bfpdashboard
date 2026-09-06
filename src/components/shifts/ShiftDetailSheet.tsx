import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Trash2, ListChecks } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useShiftAllocations } from '@/hooks/useAdminShifts';
import type { Shift } from '@/hooks/useShifts';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  shift: Shift | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileMap: Record<string, string>;
  projectMap: Record<string, string>;
  isPaid: boolean;
  onEdit: (shift: Pick<Shift, 'id'>) => void;
  onDelete?: (shiftId: string) => void;
}

export default function ShiftDetailSheet({
  shift, open, onOpenChange, profileMap, projectMap, isPaid, onEdit, onDelete,
}: Props) {
  const { data: allocations, isLoading } = useShiftAllocations(open && shift ? shift.id : undefined);

  const totalHours = Number(shift?.total_hours ?? 0);
  const allocated = (allocations ?? []).reduce((sum, a) => sum + a.hours, 0);
  const unallocated = Math.max(0, Math.round((totalHours - allocated) * 100) / 100);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto md:max-w-md md:ml-auto md:h-full md:max-h-full">
        {shift && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-base">
                {profileMap[shift.user_id] || 'Unknown'}
              </SheetTitle>
              <SheetDescription>
                {format(parseISO(shift.shift_date), 'EEEE, MMMM d, yyyy')}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {isPaid ? (
                  <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">Paid</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Unpaid</Badge>
                )}
                {shift.is_flat_rate ? (
                  <Badge variant="outline" className="text-[10px]">
                    Flat rate · ${Number(shift.flat_rate_amount || 0).toFixed(2)}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">{totalHours}h</Badge>
                )}
                {shift.admin_edited_at && <Badge variant="outline" className="text-[10px]">Admin edited</Badge>}
              </div>

              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-muted-foreground">Project: </span>
                  {shift.project_id ? (projectMap[shift.project_id] || 'Unknown project') : 'Unassigned'}
                </p>
                {shift.start_time && shift.end_time && (
                  <p>
                    <span className="text-muted-foreground">Time: </span>
                    {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                  </p>
                )}
                {shift.clock_in_at && (
                  <p>
                    <span className="text-muted-foreground">Clocked in: </span>
                    {format(new Date(shift.clock_in_at), 'p')}
                    {shift.clock_out_at ? ` · out ${format(new Date(shift.clock_out_at), 'p')}` : ' · still on the clock'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> What they worked on
                </p>
                {isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : (allocations ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks were recorded for this shift.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {(allocations ?? []).map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-3 rounded-md border p-2">
                        <span className="text-sm leading-snug">{a.task_name}</span>
                        <span className="text-sm font-medium shrink-0">{a.hours}h</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoading && !shift.is_flat_rate && unallocated > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-2">
                    <span className="text-sm text-muted-foreground">Unallocated</span>
                    <span className="text-sm font-medium">{unallocated}h</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button size="sm" className="flex-1 gap-1.5" onClick={() => onEdit(shift)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit shift
                </Button>
                {onDelete && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this shift?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the shift for {profileMap[shift.user_id] || 'this worker'} on {shift.shift_date}. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => { onDelete(shift.id); onOpenChange(false); }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
