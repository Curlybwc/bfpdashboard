import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Phone, MapPin, User } from 'lucide-react';

interface TenantRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  project_id: string;
  projects: { name: string } | null;
}

const AdminTenants = () => {
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin-tenants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, address, phone, created_at, project_id, projects(name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as TenantRow[];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Loading tenants…</p>;

  if (tenants.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">No tenants found across any project.</p>;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        All Tenants ({tenants.length})
      </h2>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Property</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    {t.name}
                  </span>
                </TableCell>
                <TableCell>
                  {t.address ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {t.address}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {t.phone ? (
                    <a href={`tel:${t.phone}`} className="flex items-center gap-1.5 text-sm hover:underline">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {t.phone}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.projects?.name ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default AdminTenants;
