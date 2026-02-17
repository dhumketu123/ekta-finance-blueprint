import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Plus, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useClients } from "@/hooks/useSupabaseData";
import { sampleClients } from "@/data/sampleData";

const Clients = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbClients, isLoading } = useClients();

  const hasDb = dbClients && dbClients.length > 0;
  const clients = hasDb ? dbClients : sampleClients;

  return (
    <AppLayout>
      <PageHeader
        title={t("clients.title")}
        description={t("clients.description")}
        actions={
          <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> {t("clients.add")}
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.area")}</TableHead>
                  <TableHead>{t("table.loan")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c: any) => {
                  const name = hasDb ? (lang === "bn" ? c.name_bn : c.name_en) : (lang === "bn" ? c.nameBn : c.nameEn);
                  const phone = hasDb ? c.phone : c.phone;
                  const area = hasDb ? c.area : c.area;
                  const loanAmt = hasDb ? c.loan_amount : c.loanAmount;
                  const status = c.status;

                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${c.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{phone || "—"}</TableCell>
                      <TableCell className="text-xs">{area || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">{loanAmt ? `৳${Number(loanAmt).toLocaleString()}` : "—"}</TableCell>
                      <TableCell><StatusBadge status={status === "overdue" ? "overdue" : status === "pending" ? "pending" : status === "active" ? "active" : "inactive"} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {clients.map((c: any) => {
              const name = hasDb ? (lang === "bn" ? c.name_bn : c.name_en) : (lang === "bn" ? c.nameBn : c.nameEn);
              const area = hasDb ? c.area : c.area;
              const loanAmt = hasDb ? c.loan_amount : c.loanAmount;
              const status = c.status;

              return (
                <div key={c.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/clients/${c.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Users className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <StatusBadge status={status === "overdue" ? "overdue" : status === "active" ? "active" : "inactive"} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span>{area || "—"}</span>
                      <span>•</span>
                      <span className="font-semibold text-foreground">{loanAmt ? `৳${Number(loanAmt).toLocaleString()}` : "—"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default Clients;
