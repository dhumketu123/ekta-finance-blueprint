import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface HoldToConfirmButtonProps {
  onConfirmed: () => void;
  holdDuration?: number;
  size?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export default function HoldToConfirmButton({
  onConfirmed,
  holdDuration = 2000,
  size = 88,
  disabled = false,
  label,
  className,
}: HoldToConfirmButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const completedRef = useRef(false);

  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(elapsed / holdDuration, 1);
    setProgress(pct);

    if (pct >= 1 && !completedRef.current) {
      completedRef.current = true;
      setHolding(false);
      onConfirmed();
      return;
    }
    if (pct < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [holdDuration, onConfirmed]);

  const handleStart = useCallback(() => {
    if (disabled) return;
    completedRef.current = false;
    startRef.current = Date.now();
    setHolding(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  const handleEnd = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (!completedRef.current) {
      setProgress(0);
      setHolding(false);
    }
  }, []);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <motion.button
        type="button"
        disabled={disabled}
        onPointerDown={handleStart}
        onPointerUp={handleEnd}
        onPointerLeave={handleEnd}
        className={cn(
          "relative rounded-full select-none touch-none focus:outline-none disabled:opacity-40",
          "bg-primary/10 border-2 border-primary/30",
          holding && "border-primary"
        )}
        style={{ width: size, height: size }}
        whileTap={disabled ? {} : { scale: 0.95 }}
        aria-label="Hold to confirm"
      >
        {/* SVG progress ring */}
        <svg
          className="absolute inset-0"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-none"
          />
        </svg>

        {/* Inner icon */}
        <span className="absolute inset-0 flex items-center justify-center text-primary font-bold text-lg">
          {progress >= 1 ? "✓" : "৳"}
        </span>
      </motion.button>

      {label && (
        <span className="text-[11px] text-muted-foreground text-center max-w-[140px]">
          {label}
        </span>
      )}
    </div>
  );
}
