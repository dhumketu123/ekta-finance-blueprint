import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { sampleOfficers } from "@/data/sampleData";
import { useLanguage } from "@/contexts/LanguageContext";

const FieldOfficers = () => {
  const { t, lang } = useLanguage();
  return (
    <AppLayout>
      <PageHeader title={t("fieldOfficers.title")} description={t("fieldOfficers.description")} />
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>{t("table.id")}</TableHead>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.phone")}</TableHead>
              <TableHead>{t("table.assignedAreas")}</TableHead>
              <TableHead>{t("table.clients")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleOfficers.map((fo) => (
              <TableRow key={fo.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{fo.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{lang === "bn" ? fo.nameBn : fo.nameEn}</p>
                </TableCell>
                <TableCell className="text-xs">{fo.phone}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {fo.assignedAreas.map((area) => (
                      <Badge key={area} variant="secondary" className="text-[10px] rounded-full">{area}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-semibold">{fo.clientCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 card-elevated p-5">
        <h3 className="text-xs font-bold text-primary mb-1.5">{t("fieldOfficers.permissions")}</h3>
        <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ml-4">
          <li>{t("fieldOfficers.perm1")}</li>
          <li>{t("fieldOfficers.perm2")}</li>
          <li>{t("fieldOfficers.perm3")}</li>
        </ul>
      </div>
    </AppLayout>
  );
};

export default FieldOfficers;
