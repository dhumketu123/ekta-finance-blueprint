import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PasswordStrengthMeterProps {
  password: string;
}

const PasswordStrengthMeter = ({ password }: PasswordStrengthMeterProps) => {
  const { lang } = useLanguage();

  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "" };

    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const levels = [
      { label: lang === "bn" ? "খুব দুর্বল" : "Very Weak", color: "hsl(0 70% 55%)" },
      { label: lang === "bn" ? "দুর্বল" : "Weak", color: "hsl(25 80% 55%)" },
      { label: lang === "bn" ? "মাঝারি" : "Fair", color: "hsl(45 80% 55%)" },
      { label: lang === "bn" ? "ভালো" : "Good", color: "hsl(120 50% 50%)" },
      { label: lang === "bn" ? "শক্তিশালী" : "Strong", color: "hsl(160 70% 45%)" },
    ];

    const level = levels[Math.min(score, 4)];
    return { score, label: level.label, color: level.color };
  }, [password, lang]);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5" role="status" aria-live="polite" aria-label={lang === "bn" ? "পাসওয়ার্ড শক্তি" : "Password strength"}>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-500"
            style={{
              background: i <= strength.score ? strength.color : "hsl(220 30% 25%)",
            }}
          />
        ))}
      </div>
      <p className="text-xs font-medium transition-colors duration-300" style={{ color: strength.color }}>
        {strength.label}
      </p>
    </div>
  );
};

export default PasswordStrengthMeter;
