import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const templates = [
  { id: "NT001", event: "Loan Due", eventBn: "ঋণ পরিশোধের তারিখ", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার ৳{পরিমাণ} ঋণ পরিশোধের তারিখ {তারিখ}।", templateEn: "Dear {name}, your loan payment of ৳{amount} is due on {date}." },
  { id: "NT002", event: "Savings Due", eventBn: "সঞ্চয় জমার তারিখ", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার সঞ্চয় জমার তারিখ {তারিখ}। পরিমাণ: ৳{পরিমাণ}।", templateEn: "Dear {name}, your savings deposit of ৳{amount} is due on {date}." },
  { id: "NT003", event: "Investor Profit", eventBn: "বিনিয়োগকারী মুনাফা", channel: "WhatsApp", templateBn: "প্রিয় {নাম}, আপনার মাসিক মুনাফা ৳{পরিমাণ} প্রদান করা হয়েছে।", templateEn: "Dear {name}, your monthly profit of ৳{amount} has been disbursed." },
  { id: "NT004", event: "Owner Deposit", eventBn: "মালিক জমা", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার সাপ্তাহিক জমা ৳{পরিমাণ} বাকি আছে।", templateEn: "Dear {name}, your weekly deposit of ৳{amount} is pending." },
];

const Notifications = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Notifications" titleBn="বিজ্ঞপ্তি ব্যবস্থাপনা" description="SMS & WhatsApp notification templates and trigger mapping" />
      
      <div className="card-elevated mb-6">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Channels / চ্যানেল</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs font-semibold">SMS (Night SIM / API)</p>
            <p className="text-[11px] text-muted-foreground font-bangla">রাতের সিম বা API এর মাধ্যমে এসএমএস পাঠানো হবে</p>
          </div>
          <div className="p-3 rounded-lg bg-muted">
            <p className="text-xs font-semibold">WhatsApp (Button Fallback)</p>
            <p className="text-[11px] text-muted-foreground font-bangla">হোয়াটসঅ্যাপ বোতাম ফলব্যাক হিসাবে ব্যবহৃত হবে</p>
          </div>
        </div>
      </div>

      <div className="card-elevated">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold">Templates / টেমপ্লেট</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">ID</TableHead>
              <TableHead className="text-xs">Event / ঘটনা</TableHead>
              <TableHead className="text-xs">Channel</TableHead>
              <TableHead className="text-xs">Template (Bangla)</TableHead>
              <TableHead className="text-xs">Template (English)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{t.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{t.event}</p>
                  <p className="text-[11px] text-muted-foreground font-bangla">{t.eventBn}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px]">{t.channel}</Badge>
                </TableCell>
                <TableCell className="text-[11px] font-bangla max-w-[200px]">{t.templateBn}</TableCell>
                <TableCell className="text-[11px] max-w-[200px]">{t.templateEn}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Notifications;
