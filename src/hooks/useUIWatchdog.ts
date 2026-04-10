import { useEffect, useRef } from "react";

type WatchdogOptions = {
  scrollRef?: React.RefObject<HTMLElement>;
  orbRef?: React.RefObject<HTMLElement>;
  getState?: () => any;
  onRecover?: (reason: string) => void;
  onResetOrb?: () => void;
};

export function useUIWatchdog({
  scrollRef,
  orbRef,
  getState,
  onRecover,
  onResetOrb,
}: WatchdogOptions) {
  const lastGoodStateRef = useRef<string | null>(null);
  const stuckCounterRef = useRef(0);

  // Store latest callbacks in refs to keep effect dependency-free
  const onRecoverRef = useRef(onRecover);
  const getStateRef = useRef(getState);
  const onResetOrbRef = useRef(onResetOrb);
  onRecoverRef.current = onRecover;
  getStateRef.current = getState;
  onResetOrbRef.current = onResetOrb;

  useEffect(() => {
    const interval = setInterval(() => {
      const scrollEl = scrollRef?.current;
      const orbEl = orbRef?.current;

      const issues: string[] = [];

      // -----------------------------
      // 1. Scroll freeze detection
      // -----------------------------
      if (scrollEl) {
        const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
        if (isScrollable && scrollEl.scrollTop === 0) {
          issues.push("SCROLL_STUCK_TOP");
        }
      }

      // -----------------------------
      // 2. Layout sanity check
      // -----------------------------
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) {
          issues.push("LAYOUT_COLLAPSED");
        }
      }

      // -----------------------------
      // 3. Orb validity check
      // -----------------------------
      if (orbEl) {
        const rect = orbEl.getBoundingClientRect();
        if (
          rect.left < -500 ||
          rect.top < -500 ||
          rect.left > window.innerWidth + 500 ||
          rect.top > window.innerHeight + 500
        ) {
          issues.push("ORB_OUT_OF_BOUNDS");
        }
      }

      // -----------------------------
      // 4. State no-update stall detection
      // -----------------------------
      const state = getStateRef.current?.();
      if (state) {
        const serialized = JSON.stringify(state);
        if (lastGoodStateRef.current === serialized) {
          stuckCounterRef.current++;
        } else {
          stuckCounterRef.current = 0;
          lastGoodStateRef.current = serialized;
        }
        if (stuckCounterRef.current > 20) {
          issues.push("STATE_NO_CHANGE_STUCK");
        }
      }

      // -----------------------------
      // 5. Recovery action
      // -----------------------------
      if (issues.length > 0) {
        onRecoverRef.current?.(issues.join(","));

        try {
          // Only auto-scroll if user is already near bottom
          if (scrollRef?.current) {
            const el = scrollRef.current;
            const nearBottom =
              el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            if (nearBottom) {
              el.scrollTop = el.scrollHeight;
            }
          }

          // Delegate orb reset to caller instead of direct DOM mutation
          if (issues.includes("ORB_OUT_OF_BOUNDS")) {
            onResetOrbRef.current?.();
          }
        } catch {}
      }
    }, 3000);

    return () => clearInterval(interval);
    // Refs are stable — no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
