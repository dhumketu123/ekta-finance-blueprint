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
          <Button size="sm" className="gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Add Client / গ্রাহক যোগ
          </Button>
        }
      />
      <div className="card-elevated">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Name / নাম</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Area / এলাকা</TableHead>
              <TableHead className="text-xs">Officer</TableHead>
              <TableHead className="text-xs">Loan</TableHead>
              <TableHead className="text-xs">Interest</TableHead>
              <TableHead className="text-xs">Payment</TableHead>
              <TableHead className="text-xs">Savings</TableHead>
              <TableHead className="text-xs">Status</TableHead>
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
                <TableCell className="text-xs">{c.loanAmount ? `৳${c.loanAmount.toLocaleString()}` : "—"}</TableCell>
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
