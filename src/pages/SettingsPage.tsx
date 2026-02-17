import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { useLanguage } from "@/contexts/LanguageContext";

const settingsSections = [
  {
    titleKey: "settings.backup",
    titleBn: "ব্যাকআপ ও পুনরুদ্ধার",
    titleEn: "Backup & Recovery",
    items: [
      { labelBn: "দৈনিক ইনক্রিমেন্টাল ব্যাকআপ", labelEn: "Daily Incremental Backup", value: "Enabled" },
      { labelBn: "সাপ্তাহিক সম্পূর্ণ ব্যাকআপ", labelEn: "Weekly Full Backup", value: "Every Sunday 2:00 AM" },
      { labelBn: "সফট ডিলিট", labelEn: "Soft Delete", value: "30-day recovery window" },
    ],
  },
  {
    titleBn: "স্থানীয়করণ",
    titleEn: "Localization",
    items: [
      { labelBn: "ডিফল্ট ভাষা", labelEn: "Default Language", value: "বাংলা (Bangla)" },
      { labelBn: "দ্বিতীয় ভাষা", labelEn: "Secondary Language", value: "English" },
      { labelBn: "মুদ্রা", labelEn: "Currency", value: "৳ BDT" },
    ],
  },
  {
    titleBn: "সম্মতি",
    titleEn: "Compliance",
    items: [
      { labelBn: "ক্ষুদ্রঋণ নিয়ন্ত্রণ", labelEn: "Microfinance Regulation", value: "Bangladesh MRA Guidelines" },
      { labelBn: "ডেটা গোপনীয়তা", labelEn: "Data Privacy", value: "Local data privacy laws applicable" },
    ],
  },
  {
    titleBn: "ভূমিকা অনুমতি",
    titleEn: "Role Permissions",
    items: [
      { labelBn: "অ্যাডমিন", labelEn: "Admin", value: "Full access — view, edit, approve, disburse, notifications" },
      { labelBn: "মাঠকর্মী", labelEn: "Field Officer", value: "View assigned clients, record loans/savings, send messages" },
      { labelBn: "মালিক", labelEn: "Owner", value: "View reports, deposit, profit distribution" },
      { labelBn: "বিনিয়োগকারী", labelEn: "Investor", value: "View own capital, profit, reinvest toggle" },
    ],
  },
];

const SettingsPage = () => {
  const { t, lang } = useLanguage();
  return (
    <AppLayout>
      <PageHeader title={t("settings.title")} description={t("settings.description")} />
      <div className="space-y-6">
        {settingsSections.map((section) => (
          <div key={section.titleEn} className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border bg-primary/5">
              <h2 className="text-sm font-bold text-primary">
                {lang === "bn" ? section.titleBn : section.titleEn}
              </h2>
            </div>
            <div className="divide-y divide-border">
              {section.items.map((item) => (
                <div key={item.labelEn} className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <p className="text-xs font-medium">
                    {lang === "bn" ? item.labelBn : item.labelEn}
                  </p>
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
