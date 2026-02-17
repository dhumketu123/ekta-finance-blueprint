import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { sampleClients } from "@/data/sampleData";

const Clients = () => {
  return (
    <AppLayout>
      <PageHeader
        titleEn="Clients"
        titleBn="গ্রাহক তালিকা"
        description="Manage all cooperative members and their loan/savings details"
        actions={
          <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Add Client / গ্রাহক যোগ
          </Button>
        }
      />
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name / নাম</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Area / এলাকা</TableHead>
              <TableHead>Officer</TableHead>
              <TableHead>Loan</TableHead>
              <TableHead>Interest</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Savings</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleClients.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{c.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{c.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{c.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs">{c.phone}</TableCell>
                <TableCell className="text-xs font-bangla">{c.area}</TableCell>
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
    </AppLayout>
  );
};

export default Clients;
