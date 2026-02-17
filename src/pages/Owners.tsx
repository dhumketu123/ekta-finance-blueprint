import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sampleOwners } from "@/data/sampleData";

const Owners = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Owners" titleBn="মালিক তালিকা" description="Manage cooperative owners and profit distribution" />
      <div className="card-elevated">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Name / নাম</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Weekly Deposit</TableHead>
              <TableHead className="text-xs">Advance Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleOwners.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{o.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{o.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{o.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs">{o.phone}</TableCell>
                <TableCell className="text-xs">৳{o.weeklyDeposit.toLocaleString()}</TableCell>
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
