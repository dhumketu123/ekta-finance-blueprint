import AppLayout from "@/components/AppLayout";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { Link } from "react-router-dom";
import { Scale, TrendingUp, Landmark, CreditCard, Users, BookOpen } from "lucide-react";

const reportLinks = [
  {
    path: "/reports/trial-balance",
    icon: Scale,
    titleBn: "ট্রায়াল ব্যালেন্স",
    titleEn: "Trial Balance",
    descBn: "সকল হিসাবের মোট ডেবিট ও ক্রেডিট সারাংশ",
    descEn: "Summary of total debit & credit for all accounts",
  },
  {
    path: "/reports/balance-sheet",
    icon: BookOpen,
    titleBn: "ব্যালেন্স শীট",
    titleEn: "Balance Sheet",
    descBn: "সম্পদ, দায় ও মালিকানা স্বত্ব — আর্থিক অবস্থান বিবরণী",
    descEn: "Assets, Liabilities & Equity — Statement of Financial Position",
  },
  {
    path: "/reports/profit-loss",
    icon: TrendingUp,
    titleBn: "আয়-ব্যয় বিবরণী",
    titleEn: "Profit & Loss",
    descBn: "আয় ও ব্যয় হিসাব থেকে নিট আয় গণনা",
    descEn: "Net income from income & expense accounts",
  },
  {
    path: "/reports/payment-status",
    icon: CreditCard,
    titleBn: "পেমেন্ট স্ট্যাটাস",
    titleEn: "Payment Status",
    descBn: "কিস্তি পরিশোধ অবস্থা — বকেয়া, পরিশোধিত, মুলতুবি",
    descEn: "Installment payment status — Overdue, Paid, Pending",
  },
  {
    path: "/reports/investor-summary",
    icon: Users,
    titleBn: "বিনিয়োগকারী সারাংশ",
    titleEn: "Investor Summary",
    descBn: "পোর্টফোলিও, লভ্যাংশ বিতরণ ও পুনর্বিনিয়োগ রিপোর্ট",
    descEn: "Portfolio, profit distribution & reinvestment report",
  },
  {
    path: "/transactions",
    icon: Landmark,
    titleBn: "আর্থিক লেনদেন",
    titleEn: "Financial Transactions",
    descBn: "সকল লেনদেন, রিসিপ্ট ও অনুমোদন",
    descEn: "All transactions, receipts & approvals",
  },
];

const ReportsPage = () => {
  const { lang } = useLanguage();

  return (
    <AppLayout>
      <PageHeader
        title={lang === "bn" ? "রিপোর্ট" : "Reports"}
        description={lang === "bn" ? "আর্থিক রিপোর্ট ও বিশ্লেষণ" : "Financial reports & analytics"}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportLinks.map((r) => (
          <Link key={r.path} to={r.path}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer border-border/50 hover:border-primary/30">
              <CardContent className="p-5 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10">
                  <r.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{lang === "bn" ? r.titleBn : r.titleEn}</p>
                  <p className="text-xs text-muted-foreground mt-1">{lang === "bn" ? r.descBn : r.descEn}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
};

export default ReportsPage;
