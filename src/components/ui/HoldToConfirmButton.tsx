import { useState, useRef, useCallback, useEffect } from "react";

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
  size = 96,
  disabled = false,
  label,
  className,
}: HoldToConfirmButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const completedRef = useRef(false);

  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

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

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const isComplete = progress >= 1;

  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        aria-label={label || "Hold to confirm transaction"}
        disabled={disabled}
        onMouseDown={handleStart}
        onTouchStart={handleStart}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchEnd={handleEnd}
        className={`
          relative select-none touch-manipulation
          rounded-full flex items-center justify-center
          transition-all duration-200
          ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
          ${holding ? "scale-95" : "scale-100"}
          ${isComplete ? "scale-105" : ""}
        `}
        style={{ width: size, height: size }}
      >
        {/* Outer glow ring */}
        <div
          className={`absolute inset-0 rounded-full transition-opacity duration-300 ${holding ? "opacity-100" : "opacity-0"}`}
          style={{
            background: `radial-gradient(circle, hsla(152, 55%, 42%, 0.25) 0%, transparent 70%)`,
            transform: "scale(1.4)",
          }}
        />

        {/* Background circle */}
        <div
          className="absolute inset-1 rounded-full transition-colors duration-200"
          style={{
            background: isComplete
              ? "hsl(152, 55%, 42%)"
              : holding
              ? "hsla(152, 55%, 42%, 0.08)"
              : "hsla(180, 100%, 15%, 0.05)",
          }}
        />

        {/* SVG Ring */}
        <svg width={size} height={size} className="absolute inset-0 -rotate-90">
          {/* Track ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke="hsl(0 0% 85%)"
            strokeWidth={5}
            fill="none"
            opacity={0.5}
          />
          {/* Progress ring */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            stroke={isComplete ? "hsl(152, 55%, 42%)" : "hsl(180, 100%, 15%)"}
            strokeWidth={5}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke] duration-200"
          />
        </svg>

        {/* Center icon */}
        <span className={`relative z-10 text-2xl font-bold transition-all duration-200 ${isComplete ? "text-white" : "text-foreground"}`}>
          {isComplete ? "✓" : "৳"}
        </span>
      </button>

      <p className="text-xs text-muted-foreground text-center font-bangla">
        {isComplete
          ? "✅ নিশ্চিত হয়েছে"
          : holding
          ? "ধরে রাখুন..."
          : "নিশ্চিত করতে বোতাম ধরে রাখুন"}
      </p>
    </div>
  );
}
