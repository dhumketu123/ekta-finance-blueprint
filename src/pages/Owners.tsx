import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useOwners } from "@/hooks/useSupabaseData";
import { sampleOwners } from "@/data/sampleData";
import { Crown } from "lucide-react";

const Owners = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbOwners, isLoading } = useOwners();

  const hasDb = dbOwners && dbOwners.length > 0;
  const owners = hasDb ? dbOwners : sampleOwners;

  return (
    <AppLayout>
      <PageHeader title={t("owners.title")} description={t("owners.description")} />

      {isLoading ? (
        <TableSkeleton rows={3} cols={3} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {owners.map((o: any) => {
                  const name = hasDb ? (lang === "bn" ? o.name_bn : o.name_en) : (lang === "bn" ? o.nameBn : o.nameEn);
                  return (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/owners/${o.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{o.phone || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {owners.map((o: any) => {
              const name = hasDb ? (lang === "bn" ? o.name_bn : o.name_en) : (lang === "bn" ? o.nameBn : o.nameEn);
              return (
                <div key={o.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/owners/${o.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
                    <Crown className="w-4.5 h-4.5 text-warning" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{o.phone || "—"}</p>
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

export default Owners;
