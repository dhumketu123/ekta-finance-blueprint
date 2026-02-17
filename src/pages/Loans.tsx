import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sampleLoanProducts } from "@/data/sampleData";

const Loans = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Loan Products" titleBn="ঋণ পণ্য" description="Configure loan products with interest rates, tenure, and validation rules" />
      <div className="card-elevated overflow-hidden">
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Product / পণ্য</TableHead>
              <TableHead>Interest %</TableHead>
              <TableHead>Tenure</TableHead>
              <TableHead>Payment Type</TableHead>
              <TableHead>Min ৳</TableHead>
              <TableHead>Max ৳</TableHead>
              <TableHead>Max Concurrent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleLoanProducts.map((lp) => (
              <TableRow key={lp.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{lp.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{lp.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{lp.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs font-semibold">{lp.interestRate}%</TableCell>
                <TableCell className="text-xs">{lp.tenure} months</TableCell>
                <TableCell className="text-xs capitalize">{lp.paymentType.replace("_", " ")}</TableCell>
                <TableCell className="text-xs">৳{lp.minAmount.toLocaleString()}</TableCell>
                <TableCell className="text-xs">৳{lp.maxAmount.toLocaleString()}</TableCell>
                <TableCell className="text-xs text-center">{lp.maxConcurrent}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Loans;
