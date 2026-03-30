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
  const keyHoldRef = useRef(false);

  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference * (1 - progress);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const pct = Math.min(elapsed / holdDuration, 1);
    setProgress(pct);

    // Progressive haptic ramp
    if (navigator.vibrate) {
      if (pct > 0.75) navigator.vibrate(25);
      else if (pct > 0.5) navigator.vibrate(15);
      else if (pct > 0.25) navigator.vibrate(10);
      else if (pct > 0) navigator.vibrate(5);
    }

    if (pct >= 1 && !completedRef.current) {
      completedRef.current = true;
      setState("done");
      // Completion pulse: solid + micro
      if (navigator.vibrate) navigator.vibrate([50, 30, 20]);
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
    keyHoldRef.current = false;
    if (!completedRef.current) {
      setProgress(0);
      setState("idle");
    }
  }, []);

  // Keyboard support: Enter/Space triggers hold simulation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && !keyHoldRef.current) {
        e.preventDefault();
        keyHoldRef.current = true;
        handleStart();
      }
    },
    [handleStart]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleEnd();
      }
    },
    [handleEnd]
  );

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

  // Inner + outer glow layers for vault-grade lighting (uses success token hsl(152,55%,42%) → rgb ~56,163,112)
  // Neon Lime (#48FF73) glow ramp
  const glowShadow =
    state === "holding"
      ? `0 0 ${10 + progress * 25}px rgba(72,255,115,${0.3 + progress * 0.5}), 0 0 ${25 + progress * 50}px rgba(72,255,115,${0.15 + progress * 0.4})`
      : state === "done"
        ? "0 0 24px rgba(72,255,115,0.8), 0 0 60px rgba(72,255,115,0.45)"
        : "0 0 12px rgba(72,255,115,0.2), 0 0 30px rgba(72,255,115,0.1)";

  return (
    <motion.button
      type="button"
      aria-label={label}
      role="button"
      tabIndex={0}
      disabled={disabled}
      onPointerDown={handleStart}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
      onPointerCancel={handleEnd}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      animate={{
        scale: state === "holding" ? 0.96 : state === "done" ? 1.05 : 1,
      }}
      transition={{
        type: "spring",
        stiffness: 350,
        damping: 25,
      }}
      className={cn(
        "relative select-none touch-none cursor-pointer rounded-full flex items-center justify-center",
        "bg-gradient-to-br from-[#48FF73] to-[#00C853]",
        "transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      style={{
        width: size,
        height: size,
        boxShadow: glowShadow,
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
        {/* Progress arc — neon lime ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#48FF73"
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeOffset}
          animate={{ strokeDashoffset: strokeOffset }}
          transition={
            state === "idle" && progress === 0
              ? { type: "spring", stiffness: 350, damping: 25 }
              : { duration: 0, ease: [0.33, 1, 0.68, 1] }
          }
        />
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center justify-center text-black font-bold">
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
