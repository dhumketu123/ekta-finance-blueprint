import { useEffect, useRef, useCallback } from "react";

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
  const lastStateRef = useRef<string | null>(null);
  const stuckCounterRef = useRef(0);

  // Store latest callbacks in refs for stable effect
  const onRecoverRef = useRef(onRecover);
  const getStateRef = useRef(getState);
  const onResetOrbRef = useRef(onResetOrb);
  onRecoverRef.current = onRecover;
  getStateRef.current = getState;
  onResetOrbRef.current = onResetOrb;

  const runCheck = useCallback((source: string) => {
    const issues: string[] = [];

    const scrollEl = scrollRef?.current;
    const orbEl = orbRef?.current;

    // -------------------------
    // Scroll anomaly
    // -------------------------
    if (scrollEl) {
      const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight;
      if (isScrollable && scrollEl.scrollTop === 0) {
        issues.push("SCROLL_STUCK_TOP");
      }
    }

    // -------------------------
    // Layout anomaly
    // -------------------------
    if (scrollEl) {
      const rect = scrollEl.getBoundingClientRect();
      if (rect.height === 0 || rect.width === 0) {
        issues.push("LAYOUT_COLLAPSED");
      }
    }

    // -------------------------
    // Orb anomaly
    // -------------------------
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

    // -------------------------
    // State no-update stall detection
    // -------------------------
    const state = getStateRef.current?.();
    if (state) {
      const serialized = JSON.stringify(state);

      if (lastStateRef.current === serialized) {
        stuckCounterRef.current++;
      } else {
        stuckCounterRef.current = 0;
        lastStateRef.current = serialized;
      }

      if (stuckCounterRef.current > 20) {
        issues.push("STATE_NO_CHANGE_STALL");
      }
    }

    // -------------------------
    // Recovery
    // -------------------------
    if (issues.length > 0) {
      onRecoverRef.current?.(`${source}:${issues.join(",")}`);

      try {
        // Safe scroll correction (only near bottom)
        if (scrollEl) {
          const nearBottom =
            scrollEl.scrollHeight -
              scrollEl.scrollTop -
              scrollEl.clientHeight <
            80;

          if (nearBottom) {
            scrollEl.scrollTop = scrollEl.scrollHeight;
          }
        }

        // Delegated orb reset
        if (issues.includes("ORB_OUT_OF_BOUNDS")) {
          onResetOrbRef.current?.();
        }
      } catch {}
    }
  }, [scrollRef, orbRef]);

  // -------------------------
  // EVENT DRIVEN HOOKS
  // -------------------------
  useEffect(() => {
    const scrollEl = scrollRef?.current;
    if (!scrollEl) return;

    const onScroll = () => runCheck("scroll");
    const onResize = () => runCheck("resize");
    const onVisibility = () => runCheck("visibility");

    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      scrollEl.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runCheck, scrollRef]);

  // Optional manual trigger (for drag / orb movement)
  const triggerCheck = useCallback(() => {
    runCheck("manual");
  }, [runCheck]);

  return { triggerCheck };
}
