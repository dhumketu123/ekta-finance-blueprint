import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { ShieldCheck, ShieldAlert, RefreshCw, CheckCircle, XCircle, Building2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";

interface BranchIntegrity {
  branch_id: string;
  branch_name: string;
  branch_name_bn: string;
  total_entries: number;
  broken_links: number;
  is_intact: boolean;
  verified_at: string;
}

const LedgerIntegrityPanel = () => {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [results, setResults] = useState<BranchIntegrity[] | null>(null);

  const verifyLedger = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("verify_all_branches_integrity" as any);
      if (error) throw error;
      return data as BranchIntegrity[];
    },
    onSuccess: (data) => {
      setResults(data);
      const allIntact = data.every((b: BranchIntegrity) => b.is_intact);
      toast({
        title: allIntact
          ? (bn ? "✅ সকল শাখার লেজার অখণ্ড" : "✅ All branch ledgers verified intact")
          : (bn ? "⚠️ কিছু শাখায় সমস্যা পাওয়া গেছে" : "⚠️ Issues found in some branches"),
        variant: allIntact ? "default" : "destructive",
      });
    },
    onError: (err: Error) =>
      toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const allIntact = results ? results.every((b) => b.is_intact) : null;
  const totalEntries = results ? results.reduce((s, b) => s + b.total_entries, 0) : 0;
  const brokenCount = results ? results.filter((b) => !b.is_intact).length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            {allIntact === true ? (
              <ShieldCheck className="w-4 h-4 text-success" />
            ) : allIntact === false ? (
              <ShieldAlert className="w-4 h-4 text-destructive" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-primary" />
            )}
            {bn ? "লেজার ইন্টেগ্রিটি যাচাই" : "Ledger Integrity Verification"}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => verifyLedger.mutate()}
            disabled={verifyLedger.isPending}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifyLedger.isPending ? "animate-spin" : ""}`} />
            {bn ? "সকল শাখা যাচাই করুন" : "Verify All Branches"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!results ? (
          <div className="text-center py-8">
            <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {bn
                ? "যাচাই শুরু করতে বোতামে ক্লিক করুন"
                : "Click the button above to start verification"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">
                  {bn ? "মোট শাখা" : "Branches"}
                </p>
                <p className="text-lg font-bold text-foreground">{results.length}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground mb-1">
                  {bn ? "মোট এন্ট্রি" : "Total Entries"}
                </p>
                <p className="text-lg font-bold text-foreground">{totalEntries.toLocaleString()}</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${brokenCount > 0 ? "bg-destructive/10" : "bg-success/10"}`}>
                <p className="text-xs text-muted-foreground mb-1">
                  {bn ? "সমস্যা" : "Issues"}
                </p>
                <p className={`text-lg font-bold ${brokenCount > 0 ? "text-destructive" : "text-success"}`}>
                  {brokenCount}
                </p>
              </div>
            </div>

            {/* Per-branch table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{bn ? "শাখা" : "Branch"}</TableHead>
                  <TableHead>{bn ? "এন্ট্রি" : "Entries"}</TableHead>
                  <TableHead>{bn ? "ভাঙা লিংক" : "Broken"}</TableHead>
                  <TableHead>{bn ? "স্থিতি" : "Status"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((b) => (
                  <TableRow key={b.branch_id}>
                    <TableCell className="font-medium text-sm flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {bn ? b.branch_name_bn || b.branch_name : b.branch_name}
                    </TableCell>
                    <TableCell className="text-sm">{b.total_entries.toLocaleString()}</TableCell>
                    <TableCell>
                      {b.broken_links > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">{b.broken_links}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {b.is_intact ? (
                        <Badge variant="secondary" className="text-[10px] gap-1 text-success">
                          <CheckCircle className="w-3 h-3" /> {bn ? "অখণ্ড" : "Intact"}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <XCircle className="w-3 h-3" /> {bn ? "ত্রুটি" : "Broken"}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LedgerIntegrityPanel;
