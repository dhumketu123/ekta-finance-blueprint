import { memo, useCallback, useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const STORAGE_KEY = "ai-orb-pos";
const CLICK_THRESHOLD_MS = 250;
const DRAG_DISTANCE_THRESHOLD = 5;
const SNAP_MARGIN = 16;

interface FloatingOrbProps {
  onTap: () => void;
  badgeCount: number;
  hidden: boolean;
}

/**
 * High-performance draggable floating orb.
 * 
 * ZERO re-renders during drag — uses direct DOM manipulation via
 * requestAnimationFrame + CSS transform for GPU-composited movement.
 * React state is only set on pointer-up (snap + persist).
 */
function FloatingOrbInner({ onTap, badgeCount, hidden }: FloatingOrbProps) {
  const isMobile = useIsMobile();
  const orbSize = isMobile ? 48 : 56;

  const orbRef = useRef<HTMLDivElement>(null);

  // Mutable drag state — never triggers re-render
  const drag = useRef({
    active: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    didMove: false,
    rafId: 0,
  });

  // Resolve initial position (from localStorage or default)
  const getInitialPos = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          return parsed as { x: number; y: number };
        }
      }
    } catch {}
    return {
      x: window.innerWidth - orbSize - 24,
      y: isMobile
        ? window.innerHeight - orbSize - 80
        : window.innerHeight - orbSize - 24,
    };
  }, [orbSize, isMobile]);

  // Apply position directly to DOM (no state)
  const applyPosition = useCallback((x: number, y: number, animate = false) => {
    const el = orbRef.current;
    if (!el) return;
    el.style.willChange = animate ? "auto" : "transform";
    el.style.transition = animate
      ? "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  // Set initial position on mount
  useEffect(() => {
    const pos = getInitialPos();
    drag.current.currentX = pos.x;
    drag.current.currentY = pos.y;
    applyPosition(pos.x, pos.y);
  }, [getInitialPos, applyPosition]);

  // Clamp to viewport
  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(window.innerWidth - orbSize, x)),
      y: Math.max(0, Math.min(window.innerHeight - orbSize, y)),
    }),
    [orbSize]
  );

  // Snap to nearest edge
  const snapToEdge = useCallback(
    (x: number, y: number) => {
      const centerX = x + orbSize / 2;
      const snappedX =
        centerX < window.innerWidth / 2
          ? SNAP_MARGIN
          : window.innerWidth - orbSize - SNAP_MARGIN;
      return { x: snappedX, y };
    },
    [orbSize]
  );

  // RAF loop for smooth drag
  const rafLoop = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;

    const raw = {
      x: d.currentX,
      y: d.currentY,
    };
    const clamped = clamp(raw.x, raw.y);
    applyPosition(clamped.x, clamped.y);

    d.rafId = requestAnimationFrame(rafLoop);
  }, [clamp, applyPosition]);

  // Pointer handlers
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      d.active = true;
      d.didMove = false;
      d.startTime = Date.now();
      d.startX = e.clientX;
      d.startY = e.clientY;

      const rect = orbRef.current?.getBoundingClientRect();
      if (!rect) return;

      d.offsetX = e.clientX - rect.left;
      d.offsetY = e.clientY - rect.top;

      // Capture on root orb element — not child
      orbRef.current?.setPointerCapture(e.pointerId);

      // Start RAF loop
      d.rafId = requestAnimationFrame(rafLoop);
    },
    [rafLoop]
  );

  // Global listeners (pointer move/up) — registered once
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;

      if (!d.didMove && Math.hypot(dx, dy) > DRAG_DISTANCE_THRESHOLD) {
        d.didMove = true;
      }

      d.currentX = e.clientX - d.offsetX;
      d.currentY = e.clientY - d.offsetY;
    };

    const onUp = () => {
      const d = drag.current;
      if (!d.active) return;

      d.active = false;
      cancelAnimationFrame(d.rafId);

      // Snap to edge with animation
      const clamped = clamp(d.currentX, d.currentY);
      const snapped = snapToEdge(clamped.x, clamped.y);
      d.currentX = snapped.x;
      d.currentY = snapped.y;

      applyPosition(snapped.x, snapped.y, true);

      // Persist
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
      } catch {}
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      cancelAnimationFrame(drag.current.rafId);
    };
  }, [clamp, snapToEdge, applyPosition]);

  // Click detection — fires onTap only if no drag occurred
  const onClick = useCallback(() => {
    const d = drag.current;
    const isClick = !d.didMove && Date.now() - d.startTime < CLICK_THRESHOLD_MS;
    if (isClick) onTap();
  }, [onTap]);

  return (
    <div
      ref={orbRef}
      onPointerDown={onPointerDown}
      onClick={onClick}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: orbSize,
        height: orbSize,
        zIndex: 100,
        touchAction: "none",
        willChange: "transform",
      }}
      className={cn(
        "rounded-full cursor-grab active:cursor-grabbing",
        "bg-gradient-to-br from-primary via-primary/80 to-accent",
        "flex items-center justify-center",
        "shadow-xl shadow-primary/20",
        hidden && "scale-0 opacity-0 pointer-events-none",
        !hidden && "scale-100 opacity-100"
      )}
      aria-label="AI অ্যাসিস্ট্যান্ট খুলুন"
    >
      <MessageCircle className="h-6 w-6 text-primary-foreground pointer-events-none" />
      {badgeCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center animate-pulse pointer-events-none"
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </Badge>
      )}
      <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-30 pointer-events-none" />
    </div>
  );
}

export const FloatingOrb = memo(FloatingOrbInner);
