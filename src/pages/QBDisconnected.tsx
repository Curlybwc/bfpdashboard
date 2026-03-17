import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PageHeader from '@/components/PageHeader';
import { Unplug } from 'lucide-react';

const QBDisconnected = () => {
  const navigate = useNavigate();

  return (
    <div className="pb-20">
      <PageHeader title="QuickBooks Disconnected" />
      <div className="p-4 flex justify-center">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Unplug className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Your QuickBooks connection has been disconnected. You can return to Payroll anytime to reconnect.
            </p>
            <Button onClick={() => navigate('/shifts')}>Go to Payroll</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QBDisconnected;
