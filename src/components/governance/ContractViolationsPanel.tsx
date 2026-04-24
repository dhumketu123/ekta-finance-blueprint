/**
 * Contract violations panel — calls audit_contract_coverage().
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface CoverageRow {
  event_type: string;
  missing_debit: boolean;
  missing_credit: boolean;
  orphan_event: boolean;
}

export function ContractViolationsPanel({ bn }: { bn: boolean }) {
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      // @ts-expect-error rpc not yet in generated types
      const { data, error } = await supabase.rpc("audit_contract_coverage");
      if (error) throw error;
      setRows((data ?? []) as CoverageRow[]);
    } catch (e: any) {
      toast.error(`${bn ? "লোড ব্যর্থ" : "Load failed"}: ${e?.message ?? ""}`);
    } finally {
      setLoading(false);
    }
  }, [bn]);

  useEffect(() => { refresh(); }, [refresh]);

  const violations = rows.filter((r) => r.missing_debit || r.missing_credit || r.orphan_event);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Badge variant={violations.length === 0 ? "secondary" : "destructive"} className="text-xs">
            {violations.length === 0
              ? (bn ? "✅ ০ লঙ্ঘন" : "✅ 0 violations")
              : `${violations.length} ${bn ? "লঙ্ঘন" : "violations"}`}
          </Badge>
          <span className="text-xs text-muted-foreground">{rows.length} {bn ? "মোট চুক্তি" : "total contracts"}</span>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {bn ? "রিফ্রেশ" : "Refresh"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {bn ? "কোনো চুক্তি পাওয়া যায়নি" : "No contracts found"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{bn ? "ইভেন্ট প্রকার" : "Event Type"}</TableHead>
                    <TableHead className="text-center">{bn ? "ডেবিট হারিয়েছে" : "Missing Debit"}</TableHead>
                    <TableHead className="text-center">{bn ? "ক্রেডিট হারিয়েছে" : "Missing Credit"}</TableHead>
                    <TableHead className="text-center">{bn ? "এতিম ইভেন্ট" : "Orphan"}</TableHead>
                    <TableHead className="text-center">{bn ? "স্থিতি" : "Status"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const ok = !r.missing_debit && !r.missing_credit && !r.orphan_event;
                    return (
                      <TableRow key={r.event_type} className={!ok ? "bg-destructive/5" : ""}>
                        <TableCell className="font-mono text-xs">{r.event_type}</TableCell>
                        <TableCell className="text-center">
                          {r.missing_debit ? <XCircle className="w-4 h-4 text-destructive mx-auto" /> : <CheckCircle2 className="w-4 h-4 text-success mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.missing_credit ? <XCircle className="w-4 h-4 text-destructive mx-auto" /> : <CheckCircle2 className="w-4 h-4 text-success mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {r.orphan_event ? <XCircle className="w-4 h-4 text-destructive mx-auto" /> : <CheckCircle2 className="w-4 h-4 text-success mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={ok ? "secondary" : "destructive"} className="text-[10px]">
                            {ok ? (bn ? "ঠিক আছে" : "OK") : (bn ? "ভাঙা" : "BROKEN")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
