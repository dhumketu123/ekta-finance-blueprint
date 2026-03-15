import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ArcReactorButtonProps {
  onConfirmed: () => void;
  holdDuration?: number;
  size?: number;
  disabled?: boolean;
  label?: string;
  sublabel?: string;
  className?: string;
}

export default function ArcReactorButton({
  onConfirmed,
  holdDuration = 2500,
  size = 120,
  disabled = false,
  label = "Hold",
  sublabel,
  className,
}: ArcReactorButtonProps) {
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "holding" | "done">("idle");
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const completedRef = useRef(false);

  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - progress);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(elapsed / holdDuration, 1);
    setProgress(pct);

    // Progressive haptics
    if (pct > 0.25 && pct < 0.5 && navigator.vibrate) navigator.vibrate(5);
    if (pct > 0.5 && pct < 0.75 && navigator.vibrate) navigator.vibrate(10);
    if (pct > 0.75 && navigator.vibrate) navigator.vibrate(15);

    if (pct >= 1 && !completedRef.current) {
      completedRef.current = true;
      setState("done");
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      onConfirmed();
      return;
    }
    if (pct < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [holdDuration, onConfirmed]);

  const handleStart = useCallback(() => {
    if (disabled || state === "done") return;
    completedRef.current = false;
    startRef.current = Date.now();
    setState("holding");
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, state, tick]);

  const handleEnd = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (!completedRef.current) {
      setProgress(0);
      setState("idle");
    }
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Reset when re-enabled
  useEffect(() => {
    if (!disabled) {
      completedRef.current = false;
      setState("idle");
      setProgress(0);
    }
  }, [disabled]);

  const pctDisplay = Math.round(progress * 100);

  const glowIntensity = state === "holding"
    ? `0 0 ${15 + progress * 30}px rgba(5,150,105,${0.3 + progress * 0.5})`
    : state === "done"
      ? "0 0 40px rgba(5,150,105,0.8)"
      : "0 0 15px rgba(5,150,105,0.2)";

  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
      onPointerCancel={handleEnd}
      animate={{
        scale: state === "holding" ? 0.96 : state === "done" ? 1.05 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20,
      }}
      className={cn(
        "relative select-none touch-none cursor-pointer rounded-full flex items-center justify-center",
        "bg-gradient-to-br from-emerald-500 to-emerald-700 dark:from-emerald-600 dark:to-emerald-800",
        "transition-shadow duration-200",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      style={{
        width: size,
        height: size,
        boxShadow: glowIntensity,
      }}
    >
      {/* SVG ring */}
      <svg
        width={size}
        height={size}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={5}
          fill="none"
        />
        {/* Progress arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="white"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          animate={{ strokeDashoffset: strokeOffset }}
          transition={
            state === "idle" && progress === 0
              ? { type: "spring", stiffness: 300, damping: 20 }
              : { duration: 0 }
          }
        />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-white">
        {state === "done" ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 12 }}
            className="text-2xl"
          >
            ✓
          </motion.span>
        ) : state === "holding" ? (
          <span className="text-lg font-bold tabular-nums">{pctDisplay}%</span>
        ) : (
          <>
            <span className="text-xl font-bold">৳</span>
            {sublabel && (
              <span className="text-[9px] font-medium opacity-80 mt-0.5">
                {sublabel}
              </span>
            )}
          </>
        )}
      </div>
    </motion.button>
  );
}
