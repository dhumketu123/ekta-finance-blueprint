import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sampleOwners } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const Owners = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  return (
    <AppLayout>
      <PageHeader title={t("owners.title")} description={t("owners.description")} />
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>{t("table.id")}</TableHead>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.phone")}</TableHead>
              <TableHead>{t("table.weeklyDeposit")}</TableHead>
              <TableHead>{t("table.advanceStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleOwners.map((o) => (
              <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/owners/${o.id}`)}>
                <TableCell className="text-xs font-mono text-muted-foreground">{o.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{lang === "bn" ? o.nameBn : o.nameEn}</p>
                </TableCell>
                <TableCell className="text-xs">{o.phone}</TableCell>
                <TableCell className="text-xs font-semibold">৳{o.weeklyDeposit.toLocaleString()}</TableCell>
                <TableCell><StatusBadge status={o.advanceDepositStatus ? "active" : "inactive"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Owners;
