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
  size = 88,
  disabled = false,
  label,
  className,
}: HoldToConfirmButtonProps) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const startRef = useRef(0);
  const rafRef = useRef(0);
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

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <button
      type="button"
      aria-label={label || "Hold to confirm transaction"}
      disabled={disabled}
      onMouseDown={handleStart}
      onTouchStart={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchEnd={handleEnd}
      className={className}
      style={{ width: size, height: size, borderRadius: "50%" }}
    >
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="gray"
          strokeWidth={4}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="green"
          strokeWidth={4}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{progress >= 1 ? "✓" : "৳"}</span>
    </button>
  );
}
