import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { sampleOfficers } from "@/data/sampleData";

const FieldOfficers = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Field Officers" titleBn="মাঠকর্মী তালিকা" description="Manage field officers and their assigned areas" />
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name / নাম</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Assigned Areas / এলাকা</TableHead>
              <TableHead>Clients</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleOfficers.map((fo) => (
              <TableRow key={fo.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{fo.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{fo.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{fo.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs">{fo.phone}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {fo.assignedAreas.map((area) => (
                      <Badge key={area} variant="secondary" className="text-[10px] font-bangla rounded-full">{area}</Badge>
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
        <h3 className="text-xs font-bold text-primary mb-1.5">Permissions / অনুমতি</h3>
        <ul className="text-[11px] text-muted-foreground space-y-1.5 list-disc ml-4">
          <li>Can only view assigned clients / শুধুমাত্র নির্ধারিত গ্রাহকদের দেখতে পারবে</li>
          <li>Can record loans and savings / ঋণ ও সঞ্চয় রেকর্ড করতে পারবে</li>
          <li>Can send messages to assigned clients / নির্ধারিত গ্রাহকদের বার্তা পাঠাতে পারবে</li>
        </ul>
      </div>
    </AppLayout>
  );
};

export default FieldOfficers;
