import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/hooks/useTenantId";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";

interface ClosedLoan {
  id: string;
  total_principal: number;
  total_interest: number;
  outstanding_principal: number;
  status: string;
  clients: {
    id: string;
    name_en: string;
    name_bn: string;
    phone?: string | null;
  } | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("bn-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount || 0);

export default function ClosedLoans() {
  const { tenantId } = useTenantId();
  const [loans, setLoans] = useState<ClosedLoan[]>([]);
  const [loading, setLoading] = useState(true);

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

      if (!error) {
        setLoans((data ?? []) as ClosedLoan[]);
      }
      setLoading(false);
    };

    fetchClosedLoans();
  }, [tenantId]);

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
                      className="border-b border-white/5 hover:bg-white/5 transition"
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
    </div>
  );
}
