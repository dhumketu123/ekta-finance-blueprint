import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { sampleClients } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Clients = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

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

      {loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <div className="card-elevated overflow-hidden">
          <Table className="table-premium">
            <TableHeader className="table-header-premium">
              <TableRow>
                <TableHead>{t("table.id")}</TableHead>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.phone")}</TableHead>
                <TableHead>{t("table.area")}</TableHead>
                <TableHead>{t("table.officer")}</TableHead>
                <TableHead>{t("table.loan")}</TableHead>
                <TableHead>{t("table.interest")}</TableHead>
                <TableHead>{t("table.payment")}</TableHead>
                <TableHead>{t("table.savings")}</TableHead>
                <TableHead>{t("table.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleClients.map((c) => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/clients/${c.id}`)}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{c.id}</TableCell>
                  <TableCell>
                    <p className="text-xs font-medium">{lang === "bn" ? c.nameBn : c.nameEn}</p>
                  </TableCell>
                  <TableCell className="text-xs">{c.phone}</TableCell>
                  <TableCell className="text-xs">{c.area}</TableCell>
                  <TableCell className="text-xs font-mono">{c.assignedOfficer}</TableCell>
                  <TableCell className="text-xs font-semibold">{c.loanAmount ? `৳${c.loanAmount.toLocaleString()}` : "—"}</TableCell>
                  <TableCell className="text-xs">{c.interestRate ? `${c.interestRate}%` : "—"}</TableCell>
                  <TableCell className="text-xs capitalize">{c.paymentType?.replace("_", " ") || "—"}</TableCell>
                  <TableCell className="text-xs uppercase">{c.savingsType || "—"}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppLayout>
  );
};

export default Clients;
