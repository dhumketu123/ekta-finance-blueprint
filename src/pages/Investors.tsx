import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { sampleInvestors } from "@/data/sampleData";

const Investors = () => {
  return (
    <AppLayout>
      <PageHeader
        titleEn="Investors"
        titleBn="বিনিয়োগকারী তালিকা"
        description="Manage investor capital, profit rates, and reinvestment settings"
        actions={
          <Button size="sm" className="gap-1.5 text-xs rounded-lg shadow-sm bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Add Investor
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
              <TableHead>Capital / মূলধন</TableHead>
              <TableHead>Monthly Profit %</TableHead>
              <TableHead>Monthly Profit ৳</TableHead>
              <TableHead>Reinvest</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleInvestors.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{inv.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{inv.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{inv.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs">{inv.phone}</TableCell>
                <TableCell className="text-xs font-semibold">৳{inv.capital.toLocaleString()}</TableCell>
                <TableCell className="text-xs">{inv.monthlyProfitPercent}%</TableCell>
                <TableCell className="text-xs text-success font-semibold">
                  ৳{((inv.capital * inv.monthlyProfitPercent) / 100).toLocaleString()}
                </TableCell>
                <TableCell>
                  <StatusBadge status={inv.reinvest ? "active" : "inactive"} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Reinvest Logic Note */}
      <div className="mt-4 card-elevated p-5">
        <h3 className="text-xs font-bold text-primary mb-1.5">Reinvestment Logic / পুনঃবিনিয়োগ নিয়ম</h3>
        <p className="text-[11px] text-muted-foreground font-bangla">
          যদি পুনঃবিনিয়োগ = হ্যাঁ, তাহলে মাসিক মুনাফা পরবর্তী মাসে মূলধনের সাথে স্বয়ংক্রিয়ভাবে যুক্ত হবে।
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          If Reinvest = Yes, monthly profit is auto-added to principal next month.
        </p>
      </div>
    </AppLayout>
  );
};

export default Investors;
