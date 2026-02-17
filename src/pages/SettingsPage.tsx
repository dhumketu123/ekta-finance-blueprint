import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";

const settingsSections = [
  {
    titleEn: "Backup & Recovery",
    titleBn: "ব্যাকআপ ও পুনরুদ্ধার",
    items: [
      { label: "Daily Incremental Backup", labelBn: "দৈনিক ইনক্রিমেন্টাল ব্যাকআপ", value: "Enabled" },
      { label: "Weekly Full Backup", labelBn: "সাপ্তাহিক সম্পূর্ণ ব্যাকআপ", value: "Every Sunday 2:00 AM" },
      { label: "Soft Delete", labelBn: "সফট ডিলিট", value: "30-day recovery window" },
    ],
  },
  {
    titleEn: "Localization",
    titleBn: "স্থানীয়করণ",
    items: [
      { label: "Default Language", labelBn: "ডিফল্ট ভাষা", value: "বাংলা (Bangla)" },
      { label: "Secondary Language", labelBn: "দ্বিতীয় ভাষা", value: "English" },
      { label: "Currency", labelBn: "মুদ্রা", value: "৳ BDT" },
    ],
  },
  {
    titleEn: "Compliance",
    titleBn: "সম্মতি",
    items: [
      { label: "Microfinance Regulation", labelBn: "ক্ষুদ্রঋণ নিয়ন্ত্রণ", value: "Bangladesh MRA Guidelines" },
      { label: "Data Privacy", labelBn: "ডেটা গোপনীয়তা", value: "Local data privacy laws applicable" },
    ],
  },
  {
    titleEn: "Role Permissions",
    titleBn: "ভূমিকা অনুমতি",
    items: [
      { label: "Admin", labelBn: "অ্যাডমিন", value: "Full access — view, edit, approve, disburse, notifications" },
      { label: "Field Officer", labelBn: "মাঠকর্মী", value: "View assigned clients, record loans/savings, send messages" },
      { label: "Owner", labelBn: "মালিক", value: "View reports, deposit, profit distribution" },
      { label: "Investor", labelBn: "বিনিয়োগকারী", value: "View own capital, profit, reinvest toggle" },
    ],
  },
];

const SettingsPage = () => {
  return (
    <AppLayout>
      <PageHeader titleEn="Settings" titleBn="সেটিংস" description="System configuration, backup, localization, and compliance" />
      <div className="space-y-6">
        {settingsSections.map((section) => (
          <div key={section.titleEn} className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border bg-primary/5">
              <h2 className="text-sm font-bold text-primary">{section.titleEn}</h2>
              <p className="text-[11px] text-muted-foreground font-bangla">{section.titleBn}</p>
            </div>
            <div className="divide-y divide-border">
              {section.items.map((item) => (
                <div key={item.label} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div>
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground font-bangla">{item.labelBn}</p>
                  </div>
                  <p className="text-xs text-muted-foreground text-right max-w-[300px]">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
};

export default SettingsPage;
