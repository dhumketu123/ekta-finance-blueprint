import { useEffect, useRef } from "react";

type WatchdogOptions = {
  scrollRef?: React.RefObject<HTMLElement>;
  orbRef?: React.RefObject<HTMLElement>;
  getState?: () => any;
  onRecover?: (reason: string) => void;
};

export function useUIWatchdog({
  scrollRef,
  orbRef,
  getState,
  onRecover,
}: WatchdogOptions) {
  const lastGoodStateRef = useRef<any>(null);
  const stuckCounterRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const scrollEl = scrollRef?.current;
      const orbEl = orbRef?.current;

      let issues: string[] = [];

      // -----------------------------
      // 1. Scroll freeze detection
      // -----------------------------
      if (scrollEl) {
        const isScrollable =
          scrollEl.scrollHeight > scrollEl.clientHeight;

        const isStuck =
          isScrollable && scrollEl.scrollTop === 0;

        if (isStuck && isScrollable) {
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
      // 4. State drift detection
      // -----------------------------
      const state = getState?.();
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
        onRecover?.(issues.join(","));

        // soft recovery strategy
        try {
          if (scrollRef?.current) {
            scrollRef.current.scrollTop =
              scrollRef.current.scrollHeight;
          }

          if (orbEl) {
            orbEl.style.transform = "translate3d(0,0,0)";
          }
        } catch {}
      }
    }, 3000); // every 3s lightweight watchdog

    return () => clearInterval(interval);
  }, [scrollRef, orbRef, getState, onRecover]);
}
