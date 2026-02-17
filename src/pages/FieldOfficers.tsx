import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { useFieldOfficers } from "@/hooks/useSupabaseData";
import { sampleOfficers } from "@/data/sampleData";
import { UserCog } from "lucide-react";

const FieldOfficers = () => {
  const { t, lang } = useLanguage();
  const navigate = useNavigate();
  const { data: dbOfficers, isLoading } = useFieldOfficers();

  const hasDb = dbOfficers && dbOfficers.length > 0;
  const officers = hasDb ? dbOfficers : sampleOfficers;

  return (
    <AppLayout>
      <PageHeader title={t("fieldOfficers.title")} description={t("fieldOfficers.description")} />

      {isLoading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : (
        <>
          <div className="card-elevated overflow-hidden hidden sm:block">
            <Table className="table-premium">
              <TableHeader className="table-header-premium">
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.phone")}</TableHead>
                  <TableHead>{t("table.clients")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {officers.map((fo: any) => {
                  const name = hasDb ? (lang === "bn" ? fo.name_bn : fo.name_en) : (lang === "bn" ? fo.nameBn : fo.nameEn);
                  const phone = fo.phone;
                  const clientCount = hasDb ? fo.clientCount : fo.clientCount;

                  return (
                    <TableRow key={fo.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => navigate(`/field-officers/${fo.id}`)}>
                      <TableCell><p className="text-xs font-medium">{name}</p></TableCell>
                      <TableCell className="text-xs">{phone || "—"}</TableCell>
                      <TableCell className="text-xs font-semibold">{clientCount}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {officers.map((fo: any) => {
              const name = hasDb ? (lang === "bn" ? fo.name_bn : fo.name_en) : (lang === "bn" ? fo.nameBn : fo.nameEn);
              const clientCount = hasDb ? fo.clientCount : fo.clientCount;

              return (
                <div key={fo.id} className="card-elevated p-4 flex items-center gap-3 cursor-pointer" onClick={() => navigate(`/field-officers/${fo.id}`)}>
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserCog className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">{clientCount} {t("table.clients")}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card-elevated p-5">
            <h3 className="text-xs font-bold text-primary mb-1.5">{t("fieldOfficers.permissions")}</h3>
            <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ml-4">
              <li>{t("fieldOfficers.perm1")}</li>
              <li>{t("fieldOfficers.perm2")}</li>
              <li>{t("fieldOfficers.perm3")}</li>
            </ul>
          </div>
        </>
      )}
    </AppLayout>
  );
};

export default FieldOfficers;
