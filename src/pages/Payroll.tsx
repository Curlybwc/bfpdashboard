import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import PayrollSummary from '@/components/shifts/PayrollSummary';
import PaymentHistory from '@/components/shifts/PaymentHistory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X } from 'lucide-react';

const Payroll = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const workerFilter = searchParams.get('worker') || undefined;
  const workerName = searchParams.get('workerName') || undefined;
  const defaultTab = searchParams.get('tab') || 'prepare';

  const clearFilter = () => {
    searchParams.delete('worker');
    searchParams.delete('workerName');
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="pb-20">
      <PageHeader title="Payroll" backTo="/admin" />
      <div className="p-4 space-y-4">
        {workerFilter && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Filtered: {workerName || 'Worker'}
            </Badge>
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={clearFilter}>
              <X className="h-3 w-3" />Clear
            </Button>
          </div>
        )}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            <TabsTrigger value="prepare" className="flex-1 text-xs">Prepare Payroll</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">Payment History</TabsTrigger>
          </TabsList>
          <TabsContent value="prepare" className="mt-4">
            <PayrollSummary
              billFirstMode
              workerFilter={workerFilter}
              onEditShift={(shift) => {
                window.location.href = `/shifts?edit=${shift.id}`;
              }}
            />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <PaymentHistory workerFilter={workerFilter} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Payroll;
