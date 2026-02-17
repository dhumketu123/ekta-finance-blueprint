import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sampleSavingsProducts } from "@/data/sampleData";

const Savings = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Savings Products" titleBn="সঞ্চয় পণ্য" description="Configure savings products with frequency and amount limits" />
      <div className="card-elevated">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Product / পণ্য</TableHead>
              <TableHead className="text-xs">Frequency / ফ্রিকোয়েন্সি</TableHead>
              <TableHead className="text-xs">Min Amount</TableHead>
              <TableHead className="text-xs">Max Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleSavingsProducts.map((sp) => (
              <TableRow key={sp.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{sp.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{sp.nameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{sp.nameBn}</p>
                </TableCell>
                <TableCell className="text-xs capitalize">{sp.frequency}</TableCell>
                <TableCell className="text-xs">৳{sp.minAmount.toLocaleString()}</TableCell>
                <TableCell className="text-xs">৳{sp.maxAmount.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 card-elevated p-4">
        <h3 className="text-xs font-semibold text-foreground mb-1">Validation Rules / যাচাইকরণ নিয়ম</h3>
        <ul className="text-[11px] text-muted-foreground space-y-1 list-disc ml-4">
          <li>Duplicate deposits on same day are blocked / একই দিনে ডুপ্লিকেট জমা বন্ধ</li>
          <li>Advance deposits locked until current cycle complete / অগ্রিম জমা বর্তমান চক্র শেষ না হওয়া পর্যন্ত লক</li>
          <li>Partial payments tracked with flags / আংশিক পরিশোধ ফ্ল্যাগ সহ ট্র্যাক করা হয়</li>
        </ul>
      </div>
    </AppLayout>
  );
};

export default Savings;
