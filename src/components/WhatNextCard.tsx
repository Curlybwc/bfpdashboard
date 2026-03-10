import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ChevronRight, AlertTriangle, CircleDot, Circle, UserX, Wrench, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { WhatNextResult } from '@/lib/projectSummary';

/** Quick-assign popover for unassigned tasks */
const QuickAssignItem = ({ task, projectId, members, crewGroups, onUpdate }: {
  task: any;
  projectId: string;
  members: { user_id: string; full_name: string | null; role: string }[];
  crewGroups: { id: string; name: string; members: string[] }[];
  onUpdate: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAssign = async (userId: string) => {
    setLoading(true);
    await supabase.from('tasks').update({ assigned_to_user_id: userId, assignment_mode: 'solo' }).eq('id', task.id);
    setLoading(false);
    setOpen(false);
    onUpdate();
  };

  const handleCrew = async (memberIds?: string[]) => {
    setLoading(true);
    await supabase.from('tasks').update({ assignment_mode: 'crew' }).eq('id', task.id);
    if (memberIds && memberIds.length > 0) {
      await supabase.from('task_candidates').insert(
        memberIds.map((uid) => ({ task_id: task.id, user_id: uid }))
      );
    }
    setLoading(false);
    setOpen(false);
    onUpdate();
  };

  const handleOutsideVendor = async () => {
    setLoading(true);
    await supabase.from('tasks').update({ is_outside_vendor: true }).eq('id', task.id);
    setLoading(false);
    setOpen(false);
    onUpdate();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors w-full text-left">
          <span className="truncate flex-1">{task.task}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">{task.priority?.split(' – ')[0] || '?'}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        {loading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
        ) : (
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Assign to</p>
            {members.map((m) => (
              <button
                key={m.user_id}
                onClick={() => handleAssign(m.user_id)}
                className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors truncate"
              >
                {m.full_name || 'Unnamed'} <span className="text-muted-foreground text-xs">({m.role})</span>
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <button
              onClick={() => handleCrew()}
              className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              🔧 Crew Task
            </button>
            {crewGroups.map((g) => (
              <button
                key={g.id}
                onClick={() => handleCrew(g.members)}
                className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors pl-6 truncate"
              >
                ↳ {g.name} ({g.members.length})
              </button>
            ))}
            <div className="h-px bg-border my-1" />
            <button
              onClick={handleOutsideVendor}
              className="w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              🏢 Outside Vendor
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/** Compact collapsible group for the "What next?" section */
const WhatNextGroup = ({ label, count, tasks, projectId, open, onToggle, mode, members, crewGroups, onUpdate }: {
  label: string; count: number; tasks: any[]; projectId: string; open?: boolean; onToggle?: () => void;
  mode?: 'assign';
  members?: { user_id: string; full_name: string | null; role: string }[];
  crewGroups?: { id: string; name: string; members: string[] }[];
  onUpdate?: () => void;
}) => (
  <Collapsible open={open} onOpenChange={onToggle}>
    <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-0.5">
      <ChevronRight className="h-3.5 w-3.5 transition-transform [[data-state=open]>&]:rotate-90" />
      {label} ({count})
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-1 pl-5 space-y-0.5">
      {tasks.slice(0, 3).map((t: any) =>
        mode === 'assign' && members && onUpdate ? (
          <QuickAssignItem key={t.id} task={t} projectId={projectId} members={members} crewGroups={crewGroups || []} onUpdate={onUpdate} />
        ) : (
          <Link
            key={t.id}
            to={`/projects/${projectId}/tasks/${t.id}`}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <span className="truncate flex-1">{t.task}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{t.priority?.split(' – ')[0] || '?'}</Badge>
          </Link>
        )
      )}
      {count > 3 && (
        <p className="text-xs text-muted-foreground px-2">+{count - 3} more</p>
      )}
    </CollapsibleContent>
  </Collapsible>
);

interface WhatNextCardProps {
  whatNext: WhatNextResult;
  projectId: string;
  isContractor: boolean;
  openGroup: string | null;
  setOpenGroup: (g: string | null) => void;
  members?: { user_id: string; full_name: string | null; role: string }[];
  crewGroups?: { id: string; name: string; members: string[] }[];
  onUpdate?: () => void;
  onFilterChange?: (filter: string) => void;
}

const WhatNextCard = ({ whatNext, projectId, isContractor, openGroup, setOpenGroup, members, crewGroups, onUpdate, onFilterChange }: WhatNextCardProps) => {
  if (!whatNext.hasAnyWork) return null;

  const toggle = (key: string) => setOpenGroup(openGroup === key ? null : key);
  const handleBadgeClick = (groupKey: string, filterKey: string) => {
    toggle(groupKey);
    onFilterChange?.(filterKey);
  };

  return (
    <Card className="mb-4 border-primary/15">
      <CardContent className="p-3 space-y-3">
        <p className="text-sm font-semibold text-foreground">What next?</p>

        {/* Highlighted recommendation */}
        <div className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
          whatNext.recommendationType === 'blocked' && 'bg-destructive/10 text-destructive',
          whatNext.recommendationType === 'unassigned' && 'bg-accent text-accent-foreground',
          whatNext.recommendationType === 'ready' && 'bg-primary/10 text-primary',
          whatNext.recommendationType === 'progress' && 'bg-muted text-muted-foreground',
          whatNext.recommendationType === 'done' && 'bg-muted text-muted-foreground',
        )}>
          {whatNext.recommendationType === 'blocked' && <AlertTriangle className="h-4 w-4 shrink-0" />}
          {whatNext.recommendationType === 'unassigned' && <UserX className="h-4 w-4 shrink-0" />}
          {whatNext.recommendationType === 'ready' && <Circle className="h-4 w-4 shrink-0" />}
          {whatNext.recommendationType === 'progress' && <CircleDot className="h-4 w-4 shrink-0" />}
          <span className="truncate">{whatNext.recommendation}</span>
        </div>

        {/* Stat chips — role-specific */}
        <div className="flex flex-wrap gap-1.5">
          {isContractor ? (
            <>
              {whatNext.myBlocked.length > 0 && (
                <Badge variant="destructive" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('myblocked', 'blocked')}>🔴 {whatNext.myBlocked.length} My Blocked</Badge>
              )}
              {whatNext.myInProgress.length > 0 && (
                <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('myprogress', 'in_progress')}>🔧 {whatNext.myInProgress.length} My In Progress</Badge>
              )}
              {whatNext.available.length > 0 && (
                <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('available', 'unassigned')}>👤 {whatNext.available.length} Available</Badge>
              )}
            </>
          ) : (
            <>
              {whatNext.blocked.length > 0 && (
                <Badge variant="destructive" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('blocked', 'blocked')}>🔴 {whatNext.blocked.length} Blocked</Badge>
              )}
              {whatNext.ready.length > 0 && (
                <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('ready', 'ready')}>🟢 {whatNext.ready.length} Ready</Badge>
              )}
              {whatNext.readyUnassigned.length > 0 && (
                <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('unassigned', 'unassigned')}>👤 {whatNext.readyUnassigned.length} Unassigned</Badge>
              )}
              {whatNext.inProgress.length > 0 && (
                <Badge variant="secondary" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('progress', 'in_progress')}>🔧 {whatNext.inProgress.length} In Progress</Badge>
              )}
              {whatNext.waitingMaterials.length > 0 && (
                <Badge variant="outline" className="text-xs font-normal cursor-pointer" onClick={() => handleBadgeClick('materials', 'materials')}><Wrench className="h-3 w-3 mr-1" />{whatNext.waitingMaterials.length} Needs Materials/Tools</Badge>
              )}
            </>
          )}
        </div>

        {/* Collapsible groups */}
        {whatNext.sortedBlocked.length > 0 && (
          <WhatNextGroup label="Blocked" count={whatNext.sortedBlocked.length} tasks={whatNext.sortedBlocked} projectId={projectId} open={openGroup === 'blocked'} onToggle={() => toggle('blocked')} />
        )}
        {whatNext.sortedReady.length > 0 && (
          <WhatNextGroup label="Ready to Start" count={whatNext.sortedReady.length} tasks={whatNext.sortedReady} projectId={projectId} open={openGroup === 'ready'} onToggle={() => toggle('ready')} />
        )}
        {whatNext.sortedUnassigned.length > 0 && (
          <WhatNextGroup
            label="Unassigned"
            count={whatNext.sortedUnassigned.length}
            tasks={whatNext.sortedUnassigned}
            projectId={projectId}
            open={openGroup === 'unassigned'}
            onToggle={() => toggle('unassigned')}
            mode="assign"
            members={members}
            crewGroups={crewGroups}
            onUpdate={onUpdate}
          />
        )}
        {whatNext.inProgress.length > 0 && (
          <WhatNextGroup label="In Progress" count={whatNext.inProgress.length} tasks={whatNext.inProgress} projectId={projectId} open={openGroup === 'progress'} onToggle={() => toggle('progress')} />
        )}
        {whatNext.sortedWaitingMaterials.length > 0 && (
          <WhatNextGroup label="Needs Materials/Tools" count={whatNext.sortedWaitingMaterials.length} tasks={whatNext.sortedWaitingMaterials} projectId={projectId} open={openGroup === 'materials'} onToggle={() => toggle('materials')} />
        )}
        {/* Contractor-specific groups */}
        {isContractor && whatNext.myBlocked.length > 0 && (
          <WhatNextGroup label="My Blocked" count={whatNext.myBlocked.length} tasks={whatNext.myBlocked} projectId={projectId} open={openGroup === 'myblocked'} onToggle={() => toggle('myblocked')} />
        )}
        {isContractor && whatNext.myInProgress.length > 0 && (
          <WhatNextGroup label="My In Progress" count={whatNext.myInProgress.length} tasks={whatNext.myInProgress} projectId={projectId} open={openGroup === 'myprogress'} onToggle={() => toggle('myprogress')} />
        )}
        {isContractor && whatNext.available.length > 0 && (
          <WhatNextGroup label="Available" count={whatNext.available.length} tasks={whatNext.available} projectId={projectId} open={openGroup === 'available'} onToggle={() => toggle('available')} />
        )}
      </CardContent>
    </Card>
  );
};

export default WhatNextCard;
