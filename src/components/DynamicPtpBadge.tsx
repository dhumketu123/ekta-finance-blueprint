import { useLanguage } from "@/contexts/LanguageContext";

interface DynamicPtpBadgeProps {
  promisedDate: string | null | undefined;
  promisedStatus: string;
}

export default function DynamicPtpBadge({ promisedDate, promisedStatus }: DynamicPtpBadgeProps) {
  const { lang } = useLanguage();
  const bn = lang === "bn";

  if (promisedStatus !== "promised" || !promisedDate) return null;

  const daysLeft = Math.ceil((new Date(promisedDate).getTime() - Date.now()) / 86400000);

  const style =
    daysLeft < 0
      ? "bg-destructive text-destructive-foreground"
      : daysLeft === 0
        ? "bg-warning text-warning-foreground"
        : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";

  const text =
    daysLeft < 0
      ? (bn ? `🚨 প্রতিশ্রুতি ভঙ্গ: ${Math.abs(daysLeft)} দিন ওভারডিউ` : `🚨 Promise Broken: ${Math.abs(daysLeft)} days overdue`)
      : daysLeft === 0
        ? (bn ? "⚠️ প্রতিশ্রুতি: আজই শেষ দিন" : "⚠️ Promise: Due Today")
        : (bn ? `🤝 প্রতিশ্রুতি: ${daysLeft} দিন বাকি` : `🤝 Promise: ${daysLeft} days left`);

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-xs shadow-sm ${style}`}>
      {text}
    </span>
  );
}
