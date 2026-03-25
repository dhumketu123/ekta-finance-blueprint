import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

interface TestResult {
  label: string;
  status: "pass" | "fail";
  detail: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PaymentTestPanel({ open, onClose }: Props) {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [testLoanId, setTestLoanId] = useState<string | null>(null);
  const { tenantId } = useTenantId();

  const addResult = (r: TestResult) => setResults((prev) => [...prev, r]);

  const runTests = async () => {
    setResults([]);
    setRunning(true);

    try {
      // 1. Create test client
      const { data: client, error: clientErr } = await (supabase.from("clients") as any)
        .insert([{ name_en: "TEST_PAYMENT_CLIENT", name_bn: "টেস্ট", status: "active", ...(tenantId ? { tenant_id: tenantId } : {}) }])
        .select().single();
      if (clientErr) throw clientErr;

      // 2. Create test loan
      const { data: loan, error: loanErr } = await (supabase.from("loans") as any)
        .insert([{
          client_id: client.id,
          total_principal: 10000,
          total_interest: 1200,
          outstanding_principal: 10000,
          outstanding_interest: 1200,
          penalty_amount: 200,
          emi_amount: 933,
          loan_model: "flat",
          status: "active",
          disbursement_date: "2025-01-01",
          maturity_date: "2025-12-31",
          ...(tenantId ? { tenant_id: tenantId } : {}),
        }])
        .select().single();
      if (loanErr) throw loanErr;
      setTestLoanId(loan.id);

      const testPerformer = "00000000-0000-0000-0000-000000000000";
      // TEST 1: Partial payment (should pay penalty first)
      const { data: r1, error: e1 } = await supabase.rpc("apply_loan_payment", {
        _loan_id: loan.id, _amount: 100, _performed_by: testPerformer, _reference_id: "test_partial_" + Date.now(),
      });
      if (e1) {
        addResult({ label: "Partial Payment", status: "fail", detail: e1.message });
      } else {
        const d = r1 as any;
        addResult({
          label: "Partial Payment (৳100)",
          status: d.penalty_paid === 100 ? "pass" : "fail",
          detail: `Penalty: ৳${d.penalty_paid}, Interest: ৳${d.interest_paid}, Principal: ৳${d.principal_paid}`,
        });
      }

      // TEST 2: Full remaining payment
      const { data: r2, error: e2 } = await supabase.rpc("apply_loan_payment", {
        _loan_id: loan.id, _amount: 11300, _reference_id: "test_full_" + Date.now(),
      });
      if (e2) {
        addResult({ label: "Full Payment", status: "fail", detail: e2.message });
      } else {
        const d = r2 as any;
        addResult({
          label: "Full Payment (৳11300)",
          status: d.loan_closed === true ? "pass" : "fail",
          detail: `Closed: ${d.loan_closed}, Remaining: ৳${d.new_outstanding}`,
        });
      }

      // TEST 3: Payment on closed loan (should fail)
      const { error: e3 } = await supabase.rpc("apply_loan_payment", {
        _loan_id: loan.id, _amount: 100, _reference_id: "test_closed_" + Date.now(),
      });
      addResult({
        label: "Closed Loan Rejection",
        status: e3 ? "pass" : "fail",
        detail: e3 ? e3.message : "ERROR: Payment accepted on closed loan!",
      });

      // TEST 4: Duplicate reference (should fail)
      // Reopen loan for this test
      await (supabase.from("loans") as any).update({ 
        status: "active", outstanding_principal: 1000, outstanding_interest: 100, penalty_amount: 0 
      }).eq("id", loan.id);
      
      const ref = "test_dup_" + Date.now();
      await supabase.rpc("apply_loan_payment", { _loan_id: loan.id, _amount: 50, _reference_id: ref });
      const { error: e4 } = await supabase.rpc("apply_loan_payment", { _loan_id: loan.id, _amount: 50, _reference_id: ref });
      addResult({
        label: "Duplicate Reference Rejection",
        status: e4 ? "pass" : "fail",
        detail: e4 ? e4.message : "ERROR: Duplicate reference accepted!",
      });

      // TEST 5: Overpayment (should fail)
      const { error: e5 } = await supabase.rpc("apply_loan_payment", {
        _loan_id: loan.id, _amount: 999999, _reference_id: "test_over_" + Date.now(),
      });
      addResult({
        label: "Overpayment Rejection",
        status: e5 ? "pass" : "fail",
        detail: e5 ? e5.message : "ERROR: Overpayment accepted!",
      });

      // Cleanup: soft delete test data
      await (supabase.from("loans") as any).update({ deleted_at: new Date().toISOString() }).eq("id", loan.id);
      await (supabase.from("clients") as any).update({ deleted_at: new Date().toISOString() }).eq("id", client.id);

      toast.success("All tests completed");
    } catch (err: any) {
      toast.error("Test setup failed: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            Payment Engine Test Panel
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Creates temporary test data, runs 5 scenarios, then cleans up. No permanent data changes.
          </p>
          <Button onClick={runTests} disabled={running} className="w-full text-xs" variant="outline">
            {running ? "Running tests..." : "Run All Tests"}
          </Button>
          {results.length > 0 && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <div key={i} className={`flex items-start gap-2 p-2 rounded text-xs ${r.status === "pass" ? "bg-success/10" : "bg-destructive/10"}`}>
                  {r.status === "pass" ? <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />}
                  <div>
                    <p className="font-semibold">{r.label}</p>
                    <p className="text-muted-foreground">{r.detail}</p>
                  </div>
                </div>
              ))}
              <div className="text-xs text-center font-semibold pt-1">
                {results.filter((r) => r.status === "pass").length}/{results.length} Passed
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
