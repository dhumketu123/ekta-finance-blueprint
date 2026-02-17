import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

const templates = [
  { id: "NT001", event: "Loan Due", eventBn: "ঋণ পরিশোধের তারিখ", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার ৳{পরিমাণ} ঋণ পরিশোধের তারিখ {তারিখ}।", templateEn: "Dear {name}, your loan payment of ৳{amount} is due on {date}." },
  { id: "NT002", event: "Savings Due", eventBn: "সঞ্চয় জমার তারিখ", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার সঞ্চয় জমার তারিখ {তারিখ}। পরিমাণ: ৳{পরিমাণ}।", templateEn: "Dear {name}, your savings deposit of ৳{amount} is due on {date}." },
  { id: "NT003", event: "Investor Profit", eventBn: "বিনিয়োগকারী মুনাফা", channel: "WhatsApp", templateBn: "প্রিয় {নাম}, আপনার মাসিক মুনাফা ৳{পরিমাণ} প্রদান করা হয়েছে।", templateEn: "Dear {name}, your monthly profit of ৳{amount} has been disbursed." },
  { id: "NT004", event: "Owner Deposit", eventBn: "মালিক জমা", channel: "SMS", templateBn: "প্রিয় {নাম}, আপনার সাপ্তাহিক জমা ৳{পরিমাণ} বাকি আছে।", templateEn: "Dear {name}, your weekly deposit of ৳{amount} is pending." },
];

const Notifications = () => {
  const { t, lang } = useLanguage();
  return (
    <AppLayout>
      <PageHeader title={t("notifications.title")} description={t("notifications.description")} />
      
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-primary">{t("notifications.channels")}</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-xs font-semibold text-foreground">SMS (Night SIM / API)</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t("notifications.sms")}</p>
          </div>
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-xs font-semibold text-foreground">WhatsApp (Button Fallback)</p>
            <p className="text-[11px] text-muted-foreground mt-1">{t("notifications.whatsapp")}</p>
          </div>
        </div>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-primary">{t("notifications.templates")}</h2>
        </div>
        <Table className="table-premium">
          <TableHeader className="table-header-premium">
            <TableRow>
              <TableHead>{t("table.id")}</TableHead>
              <TableHead>{t("table.event")}</TableHead>
              <TableHead>{t("table.channel")}</TableHead>
              <TableHead>{t("table.templateBn")}</TableHead>
              <TableHead>{t("table.templateEn")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((tpl) => (
              <TableRow key={tpl.id}>
                <TableCell className="text-xs font-mono text-muted-foreground">{tpl.id}</TableCell>
                <TableCell>
                  <p className="text-xs font-medium">{lang === "bn" ? tpl.eventBn : tpl.event}</p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-[10px] rounded-full">{tpl.channel}</Badge>
                </TableCell>
                <TableCell className="text-[11px] max-w-[200px]">{tpl.templateBn}</TableCell>
                <TableCell className="text-[11px] max-w-[200px]">{tpl.templateEn}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Notifications;
