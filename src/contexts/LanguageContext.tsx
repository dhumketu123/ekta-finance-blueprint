import { createContext, useContext, useState, ReactNode } from "react";

type Lang = "bn" | "en";

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
}

const translations: Record<string, { bn: string; en: string }> = {
  // Sidebar nav
  "nav.dashboard": { bn: "ড্যাশবোর্ড", en: "Dashboard" },
  "nav.clients": { bn: "গ্রাহক", en: "Clients" },
  "nav.investors": { bn: "বিনিয়োগকারী", en: "Investors" },
  "nav.owners": { bn: "মালিক", en: "Owners" },
  "nav.fieldOfficers": { bn: "মাঠকর্মী", en: "Field Officers" },
  "nav.loans": { bn: "ঋণ", en: "Loans" },
  "nav.savings": { bn: "সঞ্চয়", en: "Savings" },
  "nav.transactions": { bn: "আর্থিক লেনদেন", en: "Transactions" },
  "nav.commitments": { bn: "প্রতিশ্রুতি", en: "Commitments" },
  "nav.approvals": { bn: "অনুমোদন", en: "Approvals" },
  "nav.reports": { bn: "রিপোর্ট", en: "Reports" },
  "nav.notifications": { bn: "বিজ্ঞপ্তি", en: "Notifications" },
  "nav.riskDashboard": { bn: "ঝুঁকি বিশ্লেষণ", en: "Risk Dashboard" },
  "nav.monitoring": { bn: "মনিটরিং", en: "Monitoring" },
  "nav.ownerProfit": { bn: "মালিক মুনাফা", en: "Owner Profit" },
  "nav.quantumLedger": { bn: "কোয়ান্টাম লেজার", en: "Quantum Ledger" },
  "nav.settings": { bn: "সেটিংস", en: "Settings" },
  "nav.wallet": { bn: "আমার ওয়ালেট", en: "My Wallet" },

  // Header
  "header.tagline": { bn: "সমবায় ক্ষুদ্রঋণ ব্যবস্থাপনা", en: "Cooperative Microfinance Management" },
  "header.online": { bn: "অনলাইন", en: "Online" },
  "header.offline": { bn: "অফলাইন", en: "Offline" },
  "header.admin": { bn: "অ্যাডমিন", en: "Admin" },

  // Brand
  "brand.name": { bn: "একতা ফাইন্যান্স", en: "Ekta Finance" },
  "brand.tagline": { bn: "সমবায় ক্ষুদ্রঋণ ব্যবস্থাপনা", en: "Cooperative Microfinance" },

  // Dashboard
  "dashboard.title": { bn: "ড্যাশবোর্ড", en: "Dashboard" },
  "dashboard.description": { bn: "একতা ফাইন্যান্স সমবায় কার্যক্রমের সংক্ষিপ্ত বিবরণ", en: "Overview of Ekta Finance cooperative operations" },
  "dashboard.totalClients": { bn: "মোট গ্রাহক", en: "Total Clients" },
  "dashboard.activeLoans": { bn: "সক্রিয় ঋণ", en: "Active Loans" },
  "dashboard.investorCapital": { bn: "বিনিয়োগ মূলধন", en: "Investor Capital" },
  "dashboard.savingsCollected": { bn: "সঞ্চয় সংগ্রহ", en: "Savings Collected" },
  "dashboard.sendNotification": { bn: "বিজ্ঞপ্তি পাঠান", en: "Send Notification" },
  "dashboard.newClient": { bn: "নতুন গ্রাহক", en: "New Client" },
  "dashboard.overduePayments": { bn: "বকেয়া পরিশোধ", en: "Overdue Payments" },
  "dashboard.pendingDeposits": { bn: "জমা বাকি", en: "Pending Deposits" },
  "dashboard.profitDistributions": { bn: "মুনাফা বিতরণ", en: "Profit Distributions" },
  "dashboard.recentClients": { bn: "সাম্প্রতিক গ্রাহক", en: "Recent Clients" },
  "dashboard.viewAll": { bn: "সব দেখুন →", en: "View All →" },
  "dashboard.disbursed": { bn: "বিতরিত", en: "disbursed" },
  "dashboard.investors": { bn: "বিনিয়োগকারী", en: "investors" },
  "dashboard.thisMonth": { bn: "এই মাসে", en: "This month" },
  "dashboard.activeLoansCount": { bn: "সক্রিয় ঋণ", en: "active loans" },

  // Quick actions
  "action.payLoan": { bn: "ঋণ পরিশোধ", en: "Pay Loan" },
  "action.deposit": { bn: "জমা", en: "Deposit" },
  "action.reinvest": { bn: "পুনঃবিনিয়োগ", en: "Reinvest" },
  "action.sendMessage": { bn: "বার্তা পাঠান", en: "Send Message" },

  // Table headers
  "table.id": { bn: "আইডি", en: "ID" },
  "table.name": { bn: "নাম", en: "Name" },
  "table.phone": { bn: "ফোন", en: "Phone" },
  "table.area": { bn: "এলাকা", en: "Area" },
  "table.officer": { bn: "কর্মকর্তা", en: "Officer" },
  "table.loan": { bn: "ঋণ", en: "Loan" },
  "table.interest": { bn: "সুদ", en: "Interest" },
  "table.payment": { bn: "পরিশোধ", en: "Payment" },
  "table.savings": { bn: "সঞ্চয়", en: "Savings" },
  "table.status": { bn: "অবস্থা", en: "Status" },
  "table.capital": { bn: "মূলধন", en: "Capital" },
  "table.monthlyProfit": { bn: "মাসিক মুনাফা %", en: "Monthly Profit %" },
  "table.monthlyProfitAmount": { bn: "মাসিক মুনাফা ৳", en: "Monthly Profit ৳" },
  "table.reinvest": { bn: "পুনঃবিনিয়োগ", en: "Reinvest" },
  "table.weeklyDeposit": { bn: "সাপ্তাহিক জমা", en: "Weekly Deposit" },
  "table.advanceStatus": { bn: "অগ্রিম অবস্থা", en: "Advance Status" },
  "table.assignedAreas": { bn: "নির্ধারিত এলাকা", en: "Assigned Areas" },
  "table.clients": { bn: "গ্রাহক", en: "Clients" },
  "table.product": { bn: "পণ্য", en: "Product" },
  "table.tenure": { bn: "মেয়াদ", en: "Tenure" },
  "table.paymentType": { bn: "পরিশোধের ধরন", en: "Payment Type" },
  "table.minAmount": { bn: "সর্বনিম্ন ৳", en: "Min ৳" },
  "table.maxAmount": { bn: "সর্বোচ্চ ৳", en: "Max ৳" },
  "table.maxConcurrent": { bn: "সর্বোচ্চ সমসাময়িক", en: "Max Concurrent" },
  "table.frequency": { bn: "ফ্রিকোয়েন্সি", en: "Frequency" },
  "table.event": { bn: "ঘটনা", en: "Event" },
  "table.channel": { bn: "চ্যানেল", en: "Channel" },
  "table.templateBn": { bn: "টেমপ্লেট (বাংলা)", en: "Template (Bangla)" },
  "table.templateEn": { bn: "টেমপ্লেট (ইংরেজি)", en: "Template (English)" },
  "table.months": { bn: "মাস", en: "months" },

  // Page titles
  "clients.title": { bn: "গ্রাহক তালিকা", en: "Clients" },
  "clients.description": { bn: "সমস্ত সমবায় সদস্য এবং তাদের ঋণ/সঞ্চয় বিবরণ পরিচালনা করুন", en: "Manage all cooperative members and their loan/savings details" },
  "clients.add": { bn: "গ্রাহক যোগ করুন", en: "Add Client" },

  "investors.title": { bn: "বিনিয়োগকারী তালিকা", en: "Investors" },
  "investors.description": { bn: "বিনিয়োগকারী মূলধন, মুনাফার হার এবং পুনঃবিনিয়োগ সেটিংস পরিচালনা করুন", en: "Manage investor capital, profit rates, and reinvestment settings" },
  "investors.add": { bn: "বিনিয়োগকারী যোগ করুন", en: "Add Investor" },
  "investors.reinvestTitle": { bn: "পুনঃবিনিয়োগ নিয়ম", en: "Reinvestment Logic" },
  "investors.reinvestDescBn": { bn: "যদি পুনঃবিনিয়োগ = হ্যাঁ, তাহলে মাসিক মুনাফা পরবর্তী মাসে মূলধনের সাথে স্বয়ংক্রিয়ভাবে যুক্ত হবে।", en: "If Reinvest = Yes, monthly profit is auto-added to principal next month." },

  "owners.title": { bn: "মালিক তালিকা", en: "Owners" },
  "owners.description": { bn: "সমবায় মালিক এবং মুনাফা বিতরণ পরিচালনা করুন", en: "Manage cooperative owners and profit distribution" },

  "fieldOfficers.title": { bn: "মাঠকর্মী তালিকা", en: "Field Officers" },
  "fieldOfficers.description": { bn: "মাঠকর্মী এবং তাদের নির্ধারিত এলাকা পরিচালনা করুন", en: "Manage field officers and their assigned areas" },
  "fieldOfficers.permissions": { bn: "অনুমতি", en: "Permissions" },
  "fieldOfficers.perm1": { bn: "শুধুমাত্র নির্ধারিত গ্রাহকদের দেখতে পারবে", en: "Can only view assigned clients" },
  "fieldOfficers.perm2": { bn: "ঋণ ও সঞ্চয় রেকর্ড করতে পারবে", en: "Can record loans and savings" },
  "fieldOfficers.perm3": { bn: "নির্ধারিত গ্রাহকদের বার্তা পাঠাতে পারবে", en: "Can send messages to assigned clients" },

  "loans.title": { bn: "ঋণ পণ্য", en: "Loan Products" },
  "loans.description": { bn: "সুদের হার, মেয়াদ এবং যাচাইকরণ নিয়ম সহ ঋণ পণ্য কনফিগার করুন", en: "Configure loan products with interest rates, tenure, and validation rules" },

  "savings.title": { bn: "সঞ্চয় পণ্য", en: "Savings Products" },
  "savings.description": { bn: "ফ্রিকোয়েন্সি এবং পরিমাণ সীমা সহ সঞ্চয় পণ্য কনফিগার করুন", en: "Configure savings products with frequency and amount limits" },
  "savings.validationTitle": { bn: "যাচাইকরণ নিয়ম", en: "Validation Rules" },
  "savings.rule1": { bn: "একই দিনে ডুপ্লিকেট জমা বন্ধ", en: "Duplicate deposits on same day are blocked" },
  "savings.rule2": { bn: "অগ্রিম জমা বর্তমান চক্র শেষ না হওয়া পর্যন্ত লক", en: "Advance deposits locked until current cycle complete" },
  "savings.rule3": { bn: "আংশিক পরিশোধ ফ্ল্যাগ সহ ট্র্যাক করা হয়", en: "Partial payments tracked with flags" },

  "notifications.title": { bn: "বিজ্ঞপ্তি ব্যবস্থাপনা", en: "Notifications" },
  "notifications.description": { bn: "এসএমএস এবং হোয়াটসঅ্যাপ বিজ্ঞপ্তি টেমপ্লেট এবং ট্রিগার ম্যাপিং", en: "SMS & WhatsApp notification templates and trigger mapping" },
  "notifications.channels": { bn: "চ্যানেল", en: "Channels" },
  "notifications.templates": { bn: "টেমপ্লেট", en: "Templates" },
  "notifications.sms": { bn: "রাতের সিম বা API এর মাধ্যমে এসএমএস পাঠানো হবে", en: "SMS via Night SIM or API" },
  "notifications.whatsapp": { bn: "হোয়াটসঅ্যাপ বোতাম ফলব্যাক হিসাবে ব্যবহৃত হবে", en: "WhatsApp button fallback" },

  "settings.title": { bn: "সেটিংস", en: "Settings" },
  "settings.description": { bn: "সিস্টেম কনফিগারেশন, ব্যাকআপ, স্থানীয়করণ এবং সম্মতি", en: "System configuration, backup, localization, and compliance" },

  // Search
  "search.placeholder": { bn: "খুঁজুন...", en: "Search..." },
  "search.noResults": { bn: "কিছু পাওয়া যায়নি", en: "No results found" },

  // Back
  "back": { bn: "পেছনে যান", en: "Go Back" },

  // Detail pages
  "detail.notFound": { bn: "তথ্য পাওয়া যায়নি", en: "Not Found" },
  "detail.notFoundDesc": { bn: "অনুরোধকৃত তথ্য খুঁজে পাওয়া যায়নি।", en: "The requested record was not found." },
  "detail.client": { bn: "গ্রাহক", en: "Client" },
  "detail.investor": { bn: "বিনিয়োগকারী", en: "Investor" },
  "detail.owner": { bn: "মালিক", en: "Owner" },
  "detail.officer": { bn: "মাঠকর্মী", en: "Field Officer" },
  "detail.loanProduct": { bn: "ঋণ পণ্য", en: "Loan Product" },
  "detail.savingsProduct": { bn: "সঞ্চয় পণ্য", en: "Savings Product" },
  "detail.personalInfo": { bn: "ব্যক্তিগত তথ্য", en: "Personal Info" },
  "detail.loanInfo": { bn: "ঋণ তথ্য", en: "Loan Info" },
  "detail.savingsInfo": { bn: "সঞ্চয় তথ্য", en: "Savings Info" },
  "detail.contactInfo": { bn: "যোগাযোগ", en: "Contact Info" },
  "detail.details": { bn: "বিস্তারিত", en: "Details" },
  "detail.configuration": { bn: "কনফিগারেশন", en: "Configuration" },
  "detail.nameEn": { bn: "নাম (ইংরেজি)", en: "Name (English)" },
  "detail.frequency": { bn: "ফ্রিকোয়েন্সি", en: "Frequency" },
  "detail.nextDeposit": { bn: "পরবর্তী জমা", en: "Next Deposit" },
  "detail.monthlyProfitAmt": { bn: "মাসিক মুনাফা ৳", en: "Monthly Profit ৳" },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [lang, setLang] = useState<Lang>("bn");

  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang];
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};
