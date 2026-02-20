import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Check, X } from "lucide-react";

interface PasswordStrengthMeterProps {
  password: string;
  showChecklist?: boolean;
}

export interface PasswordValidation {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  isValid: boolean;
}

export const validatePassword = (password: string): PasswordValidation => {
  const minLength = password.length >= 10;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isValid = minLength && hasUppercase && hasLowercase && hasNumber;
  return { minLength, hasUppercase, hasLowercase, hasNumber, isValid };
};

const PasswordStrengthMeter = ({ password, showChecklist = true }: PasswordStrengthMeterProps) => {
  const { lang } = useLanguage();

  const validation = useMemo(() => validatePassword(password), [password]);

  const strength = useMemo(() => {
    if (!password) return { score: 0, label: "", color: "" };

    let score = 0;
    if (validation.minLength) score++;
    if (validation.hasLowercase) score++;
    if (validation.hasUppercase) score++;
    if (validation.hasNumber) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const levels = [
      { label: lang === "bn" ? "খুব দুর্বল" : "Very Weak", color: "hsl(var(--destructive))" },
      { label: lang === "bn" ? "দুর্বল" : "Weak", color: "hsl(var(--warning))" },
      { label: lang === "bn" ? "মাঝারি" : "Fair", color: "hsl(var(--warning))" },
      { label: lang === "bn" ? "ভালো" : "Good", color: "hsl(var(--success))" },
      { label: lang === "bn" ? "শক্তিশালী" : "Strong", color: "hsl(var(--success))" },
    ];

    const level = levels[Math.min(score, 4)];
    return { score, label: level.label, color: level.color };
  }, [password, lang, validation]);

  if (!password) return null;

  const checklist = [
    { key: "minLength", passed: validation.minLength, label: lang === "bn" ? "কমপক্ষে ১০ অক্ষর" : "At least 10 characters" },
    { key: "hasUppercase", passed: validation.hasUppercase, label: lang === "bn" ? "বড় হাতের অক্ষর (A-Z)" : "Uppercase letter (A-Z)" },
    { key: "hasLowercase", passed: validation.hasLowercase, label: lang === "bn" ? "ছোট হাতের অক্ষর (a-z)" : "Lowercase letter (a-z)" },
    { key: "hasNumber", passed: validation.hasNumber, label: lang === "bn" ? "সংখ্যা (0-9)" : "Number (0-9)" },
  ];

  return (
    <div className="mt-2 space-y-2" role="status" aria-live="polite" aria-label={lang === "bn" ? "পাসওয়ার্ড শক্তি" : "Password strength"}>
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-500"
            style={{
              background: i <= strength.score ? strength.color : "hsl(var(--muted))",
            }}
          />
        ))}
      </div>
      <p className="text-xs font-medium transition-colors duration-300" style={{ color: strength.color }}>
        {strength.label}
      </p>

      {/* Checklist */}
      {showChecklist && (
        <ul className="space-y-1 mt-1">
          {checklist.map((item) => (
            <li key={item.key} className="flex items-center gap-1.5 text-xs">
              {item.passed ? (
                <Check size={13} className="text-success shrink-0" />
              ) : (
                <X size={13} className="text-muted-foreground/50 shrink-0" />
              )}
              <span className={item.passed ? "text-success" : "text-muted-foreground/60"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PasswordStrengthMeter;
