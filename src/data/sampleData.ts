import type { Client, Investor, Owner, FieldOfficer, LoanProduct, SavingsProduct } from "@/types/models";

export const sampleClients: Client[] = [
  { id: "CL001", nameBn: "আব্দুল করিম", nameEn: "Abdul Karim", phone: "01711000001", area: "মিরপুর", assignedOfficer: "FO001", status: "active", loanStatus: "active", loanAmount: 50000, interestRate: 12, tenure: 12, paymentType: "emi", savingsType: "dbs", depositFrequency: "weekly", nextDepositDate: "2026-02-20" },
  { id: "CL002", nameBn: "ফাতেমা বেগম", nameEn: "Fatema Begum", phone: "01711000002", area: "উত্তরা", assignedOfficer: "FO001", status: "active", loanStatus: "active", loanAmount: 30000, interestRate: 10, tenure: 6, paymentType: "monthly_profit", savingsType: "general", depositFrequency: "monthly", nextDepositDate: "2026-03-01" },
  { id: "CL003", nameBn: "মোঃ রফিকুল", nameEn: "Md. Rafiqul", phone: "01711000003", area: "ধানমন্ডি", assignedOfficer: "FO002", status: "active", loanStatus: "closed", savingsType: "dbs", depositFrequency: "daily", nextDepositDate: "2026-02-18" },
  { id: "CL004", nameBn: "সালমা আক্তার", nameEn: "Salma Akter", phone: "01711000004", area: "মিরপুর", assignedOfficer: "FO002", status: "inactive", loanStatus: "none" },
  { id: "CL005", nameBn: "জাহিদ হাসান", nameEn: "Jahid Hasan", phone: "01711000005", area: "গুলশান", assignedOfficer: "FO001", status: "active", loanStatus: "active", loanAmount: 100000, interestRate: 15, tenure: 24, paymentType: "bullet", savingsType: "general", depositFrequency: "monthly", nextDepositDate: "2026-03-01" },
];

export const sampleInvestors: Investor[] = [
  { id: "INV001", nameBn: "হাসান আলী", nameEn: "Hasan Ali", phone: "01811000001", capital: 500000, monthlyProfitPercent: 3, reinvest: true },
  { id: "INV002", nameBn: "নূরুল ইসলাম", nameEn: "Nurul Islam", phone: "01811000002", capital: 1000000, monthlyProfitPercent: 2.5, reinvest: false },
  { id: "INV003", nameBn: "শামীম আহমেদ", nameEn: "Shamim Ahmed", phone: "01811000003", capital: 300000, monthlyProfitPercent: 3.5, reinvest: true },
];

export const sampleOwners: Owner[] = [
  { id: "OW001", nameEn: "Rahim Uddin", nameBn: "রহিম উদ্দিন", phone: "01911000001", weeklyDeposit: 5000, advanceDepositStatus: false },
  { id: "OW002", nameEn: "Kamal Hossain", nameBn: "কামাল হোসেন", phone: "01911000002", weeklyDeposit: 5000, advanceDepositStatus: true },
];

export const sampleOfficers: FieldOfficer[] = [
  { id: "FO001", nameEn: "Sumon Das", nameBn: "সুমন দাস", phone: "01611000001", assignedAreas: ["মিরপুর", "উত্তরা", "গুলশান"], clientCount: 3 },
  { id: "FO002", nameEn: "Arif Khan", nameBn: "আরিফ খান", phone: "01611000002", assignedAreas: ["ধানমন্ডি", "মিরপুর"], clientCount: 2 },
];

export const sampleLoanProducts: LoanProduct[] = [
  { id: "LP001", nameEn: "Micro Loan", nameBn: "ক্ষুদ্র ঋণ", interestRate: 12, tenure: 12, paymentType: "emi", minAmount: 10000, maxAmount: 100000, maxConcurrent: 2 },
  { id: "LP002", nameEn: "Business Loan", nameBn: "ব্যবসায়িক ঋণ", interestRate: 15, tenure: 24, paymentType: "monthly_profit", minAmount: 50000, maxAmount: 500000, maxConcurrent: 1 },
  { id: "LP003", nameEn: "Emergency Loan", nameBn: "জরুরি ঋণ", interestRate: 10, tenure: 6, paymentType: "bullet", minAmount: 5000, maxAmount: 50000, maxConcurrent: 1 },
];

export const sampleSavingsProducts: SavingsProduct[] = [
  { id: "SP001", nameEn: "Daily Benefit Savings (DBS)", nameBn: "দৈনিক সুবিধা সঞ্চয়", frequency: "daily", minAmount: 50, maxAmount: 5000 },
  { id: "SP002", nameEn: "General Savings", nameBn: "সাধারণ সঞ্চয়", frequency: "monthly", minAmount: 500, maxAmount: 50000 },
  { id: "SP003", nameEn: "Weekly Savings", nameBn: "সাপ্তাহিক সঞ্চয়", frequency: "weekly", minAmount: 100, maxAmount: 10000 },
];
