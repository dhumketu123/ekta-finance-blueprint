import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { CheckCircle, Phone, Calendar, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface ClosedLoan {
  id: string;
  total_principal: number;
  total_interest: number;
  outstanding_principal: number;
  status: string;
  updated_at: string;
  clients: {
    id: string;
    name_en: string;
    name_bn: string;
    phone?: string | null;
  } | null;
}

interface LoanSchedule {
  id: string;
  due_date: string | null;
  paid_date: string | null;
  principal_paid: number | null;
  interest_paid: number | null;
  total_due: number | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount || 0);

const formatDate = (date: string | null | undefined) => {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat("bn-BD", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(date));
  } catch {
    return "—";
  }
};

export default function ClosedLoans() {
  const { tenantId } = useTenantId();
  const [loans, setLoans] = useState<ClosedLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoan, setSelectedLoan] = useState<ClosedLoan | null>(null);
  const [schedules, setSchedules] = useState<LoanSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);

  useEffect(() => {
    const fetchClosedLoans = async () => {
      if (!tenantId) {
        setLoading(false);
        return;
      }
      setLoading(true);

      const { data, error } = await supabase
        .from("loans")
        .select(`
          id,
          total_principal,
          total_interest,
          outstanding_principal,
          status,
          updated_at,
          clients (id, name_en, name_bn, phone)
        `)
        .eq("tenant_id", tenantId)
        .eq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("[ClosedLoans] fetch error:", error);
        toast.error("পরিশোধিত ঋণ লোড করা যায়নি", {
          description: error.message,
        });
        setLoans([]);
      } else {
        setLoans((data ?? []) as ClosedLoan[]);
      }
      setLoading(false);
    };

    fetchClosedLoans();
  }, [tenantId]);

  const handleRowClick = async (loan: ClosedLoan) => {
    setSelectedLoan(loan);
    setSchedules([]);
    setSchedulesLoading(true);

    const { data, error } = await supabase
      .from("loan_schedules")
      .select("id, due_date, paid_date, principal_paid, interest_paid, total_due")
      .eq("loan_id", loan.id)
      .order("due_date", { ascending: true })
      .limit(50);

    if (error) {
      console.error("[ClosedLoans] schedules error:", error);
      toast.error("পেমেন্ট ইতিহাস লোড করা যায়নি");
    } else {
      setSchedules((data ?? []) as LoanSchedule[]);
    }
    setSchedulesLoading(false);
  };

  const riskProvision = selectedLoan
    ? selectedLoan.total_principal * 0.05
    : 0;
  const totalPaid = selectedLoan
    ? selectedLoan.total_principal + selectedLoan.total_interest
    : 0;

  return (
    <div className="p-6 space-y-6">
      <Card className="backdrop-blur-xl bg-white/5 border border-white/10 shadow-xl">
        <CardHeader>
          <CardTitle className="text-xl font-semibold flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            পরিশোধিত ঋণ
          </CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">লোড হচ্ছে...</div>
          ) : loans.length === 0 ? (
            <div className="text-muted-foreground">
              কোনো পরিশোধিত ঋণ পাওয়া যায়নি।
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-white/10 text-muted-foreground">
                  <tr>
                    <th className="text-left py-3">গ্রাহকের নাম</th>
                    <th className="text-left py-3">ঋণের পরিমাণ</th>
                    <th className="text-left py-3">মোট পরিশোধ</th>
                    <th className="text-left py-3">অবস্থা</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr
                      key={loan.id}
                      onClick={() => handleRowClick(loan)}
                      className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer"
                    >
                      <td className="py-3">
                        {loan.clients?.name_bn || loan.clients?.name_en || "N/A"}
                      </td>
                      <td className="py-3">
                        {formatCurrency(loan.total_principal)}
                      </td>
                      <td className="py-3">
                        {formatCurrency(
                          loan.total_principal + loan.total_interest
                        )}
                      </td>
                      <td className="py-3">
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          পরিশোধিত
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={!!selectedLoan}
        onOpenChange={(open) => !open && setSelectedLoan(null)}
      >
        <SheetContent
          side="right"
          className="backdrop-blur-xl bg-background/80 border-l border-white/10 w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              ঋণের বিস্তারিত
            </SheetTitle>
            <SheetDescription>
              {selectedLoan?.clients?.name_bn ||
                selectedLoan?.clients?.name_en ||
                "N/A"}
            </SheetDescription>
          </SheetHeader>

          {selectedLoan && (
            <div className="mt-6 space-y-5">
              {/* Client Block */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  গ্রাহক
                </div>
                <div className="font-semibold">
                  {selectedLoan.clients?.name_bn ||
                    selectedLoan.clients?.name_en ||
                    "N/A"}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-3.5 h-3.5" />
                  {selectedLoan.clients?.phone || "—"}
                </div>
              </div>

              {/* Financial Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">মূলধন</div>
                  <div className="text-lg font-semibold mt-1">
                    {formatCurrency(selectedLoan.total_principal)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-muted-foreground">
                    মোট পরিশোধ
                  </div>
                  <div className="text-lg font-semibold mt-1 text-emerald-400">
                    {formatCurrency(totalPaid)}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 col-span-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ঝুঁকি সঞ্চিতি (৫%)
                  </div>
                  <div className="text-lg font-semibold mt-1 text-emerald-300">
                    {formatCurrency(riskProvision)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4 col-span-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    পরিশোধ তারিখ
                  </div>
                  <div className="text-sm font-medium mt-1">
                    {formatDate(selectedLoan.updated_at)}
                  </div>
                </div>
              </div>

              {/* Payment History */}
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  পেমেন্ট ইতিহাস
                </div>
                {schedulesLoading ? (
                  <div className="text-sm text-muted-foreground">
                    লোড হচ্ছে...
                  </div>
                ) : schedules.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    কোনো রেকর্ড নেই।
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {schedules.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between text-sm border-b border-white/5 pb-2 last:border-0"
                      >
                        <span className="text-muted-foreground">
                          {formatDate(s.paid_date || s.due_date)}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(
                            s.amount_paid ?? s.total_amount ?? 0
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
