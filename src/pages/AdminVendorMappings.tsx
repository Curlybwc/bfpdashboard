import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Save, AlertTriangle } from "lucide-react";

type VendorMapping = {
  id: string;
  user_id: string;
  qb_vendor_id: string;
  qb_vendor_name: string | null;
  company_id: string | null;
  worker_name: string | null;
};

type Company = { id: string; name: string; short_name: string | null };

export default function AdminVendorMappings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState<VendorMapping[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const [mappingsRes, companiesRes, profilesRes] = await Promise.all([
      supabase.from("quickbooks_vendor_mappings").select("id, user_id, qb_vendor_id, qb_vendor_name, company_id").order("qb_vendor_name"),
      supabase.from("companies").select("id, name, short_name"),
      supabase.from("profiles").select("id, full_name"),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));
    const enriched = (mappingsRes.data || []).map((m: any) => ({
      ...m,
      worker_name: profileMap.get(m.user_id) || m.user_id,
    }));

    setMappings(enriched);
    setCompanies(companiesRes.data || []);
    setLoading(false);
  };

  const handleCompanyChange = (mappingId: string, companyId: string) => {
    setEdits((prev) => ({ ...prev, [mappingId]: companyId === "__none__" ? null : companyId }));
  };

  const pendingCount = Object.keys(edits).length;
  const unassignedCount = mappings.filter((m) => !m.company_id && !edits[m.id]).length;

  const saveAll = async () => {
    setSaving(true);
    let success = 0;
    let failed = 0;
    for (const [id, companyId] of Object.entries(edits)) {
      const { error } = await supabase
        .from("quickbooks_vendor_mappings")
        .update({ company_id: companyId })
        .eq("id", id);
      if (error) failed++;
      else success++;
    }
    if (failed) toast.error(`${failed} mapping(s) failed to save`);
    else toast.success(`${success} mapping(s) updated`);
    setEdits({});
    await loadData();
    setSaving(false);
  };

  const getEffectiveCompany = (m: VendorMapping) => {
    if (m.id in edits) return edits[m.id];
    return m.company_id;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="QB Vendor Mappings" />
      <div className="max-w-4xl mx-auto px-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Admin
          </Button>
          <div className="flex items-center gap-3">
            {unassignedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" /> {unassignedCount} unassigned
              </Badge>
            )}
            {pendingCount > 0 && (
              <Button size="sm" onClick={saveAll} disabled={saving}>
                <Save className="h-4 w-4 mr-1" /> Save {pendingCount} change{pendingCount > 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground text-center py-8">Loading…</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>QB Vendor</TableHead>
                  <TableHead>QB Vendor ID</TableHead>
                  <TableHead>Company</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => {
                  const effective = getEffectiveCompany(m);
                  const isEdited = m.id in edits;
                  const isUnassigned = !effective;
                  return (
                    <TableRow key={m.id} className={isUnassigned ? "bg-destructive/5" : isEdited ? "bg-primary/5" : ""}>
                      <TableCell className="font-medium">{m.worker_name}</TableCell>
                      <TableCell>{m.qb_vendor_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs font-mono">{m.qb_vendor_id}</TableCell>
                      <TableCell>
                        <Select
                          value={effective || "__none__"}
                          onValueChange={(v) => handleCompanyChange(m.id, v)}
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select company" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— Unassigned —</SelectItem>
                            {companies.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.short_name || c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
