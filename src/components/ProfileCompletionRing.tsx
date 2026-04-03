import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const REQUIRED_FIELDS = [
  "name_en",
  "phone",
  "father_or_husband_name",
  "mother_name",
  "nid_number",
  "date_of_birth",
  "marital_status",
  "occupation",
  "village",
  "upazila",
  "district",
  "nominee_name",
  "nominee_phone",
] as const;

interface Props {
  client: Record<string, any>;
  size?: number;
  strokeWidth?: number;
  children: React.ReactNode;
}

export default function ProfileCompletionRing({ client, size = 120, strokeWidth = 4, children }: Props) {
  const { percent, color, dashArray, dashOffset } = useMemo(() => {
    const filled = REQUIRED_FIELDS.filter((f) => {
      const v = client[f];
      return v !== null && v !== undefined && String(v).trim() !== "";
    }).length;
    const pct = Math.round((filled / REQUIRED_FIELDS.length) * 100);

    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    let col = "hsl(var(--destructive))";
    if (pct >= 80) col = "hsl(var(--success))";
    else if (pct >= 40) col = "hsl(var(--warning))";

    return {
      percent: pct,
      color: col,
      dashArray: circumference,
      dashOffset: offset,
    };
  }, [client, size, strokeWidth]);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Track ring */}
            <svg
              width={size}
              height={size}
              className="absolute inset-0 -rotate-90"
              style={{ transform: "rotate(-90deg)" }}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={strokeWidth}
              />
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                style={{
                  transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1), stroke 0.5s ease",
                }}
              />
            </svg>
            {/* Content slot — rigid aspect-square container */}
            <div
              className="relative z-10 overflow-hidden rounded-full ring-2 ring-border/20 shadow-sm flex items-center justify-center aspect-square"
              style={{
                width: size - strokeWidth * 3,
                height: size - strokeWidth * 3,
                minWidth: size - strokeWidth * 3,
                minHeight: size - strokeWidth * 3,
                borderRadius: 9999,
              }}
            >
              {children}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs font-medium">
          প্রোফাইল সম্পূর্ণতা: {percent}%
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
