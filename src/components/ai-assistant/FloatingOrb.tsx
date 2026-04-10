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

/** Validate a saved position is within current viewport bounds */
function isValidPos(
  pos: unknown,
  orbSize: number
): pos is { x: number; y: number } {
  if (
    !pos ||
    typeof pos !== "object" ||
    typeof (pos as any).x !== "number" ||
    typeof (pos as any).y !== "number"
  )
    return false;
  const { x, y } = pos as { x: number; y: number };
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  // Allow slightly out-of-bounds (resize between sessions) — clamp later
  return x >= -orbSize && y >= -orbSize;
}

/**
 * High-performance draggable floating orb.
 *
 * ZERO re-renders during drag — uses direct DOM manipulation via
 * requestAnimationFrame + CSS transform for GPU-composited movement.
 * No React state is set during pointermove.
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

  // --- Position helpers (pure functions, no state) ---

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(window.innerWidth - orbSize, x)),
      y: Math.max(0, Math.min(window.innerHeight - orbSize, y)),
    }),
    [orbSize]
  );

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

  const defaultPos = useCallback(
    () => ({
      x: window.innerWidth - orbSize - 24,
      y: isMobile
        ? window.innerHeight - orbSize - 80
        : window.innerHeight - orbSize - 24,
    }),
    [orbSize, isMobile]
  );

  // Apply position directly to DOM (no React state)
  const applyPosition = useCallback(
    (x: number, y: number, animate = false) => {
      const el = orbRef.current;
      if (!el) return;
      if (animate) {
        el.style.willChange = "transform";
        el.style.transition =
          "transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)";
      } else {
        el.style.transition = "none";
      }
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      // Clear willChange after animated transition completes to free GPU memory
      if (animate) {
        const tid = setTimeout(() => {
          if (orbRef.current) orbRef.current.style.willChange = "auto";
        }, 300);
        // Store for potential cleanup (overwritten each snap — fine)
        (el as any).__wcTimeout = tid;
      }
    },
    []
  );

  // --- Mount: resolve initial position ---
  useEffect(() => {
    let pos: { x: number; y: number };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      pos = isValidPos(parsed, orbSize) ? clamp(parsed.x, parsed.y) : defaultPos();
    } catch {
      pos = defaultPos();
    }
    drag.current.currentX = pos.x;
    drag.current.currentY = pos.y;
    applyPosition(pos.x, pos.y);
  }, [orbSize, clamp, defaultPos, applyPosition]);

  // --- RAF loop for smooth drag ---
  const rafLoop = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    const clamped = clamp(d.currentX, d.currentY);
    applyPosition(clamped.x, clamped.y);
    d.rafId = requestAnimationFrame(rafLoop);
  }, [clamp, applyPosition]);

  // --- Finalize drag (shared by pointerup + pointercancel + visibility) ---
  const finalizeDrag = useCallback(() => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    cancelAnimationFrame(d.rafId);

    const clamped = clamp(d.currentX, d.currentY);
    const snapped = snapToEdge(clamped.x, clamped.y);
    d.currentX = snapped.x;
    d.currentY = snapped.y;
    applyPosition(snapped.x, snapped.y, true);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapped));
    } catch {}
  }, [clamp, snapToEdge, applyPosition]);

  // --- Pointer down handler ---
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

      // Capture on root orb element — never child
      orbRef.current?.setPointerCapture(e.pointerId);

      // Start RAF loop
      d.rafId = requestAnimationFrame(rafLoop);
    },
    [rafLoop]
  );

  // --- Global listeners (registered once, cleaned on unmount) ---
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.active) return;

      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.didMove && Math.hypot(dx, dy) > DRAG_DISTANCE_THRESHOLD) {
        d.didMove = true;
      }

      // Write only — no DOM read. DOM update happens in RAF loop.
      d.currentX = e.clientX - d.offsetX;
      d.currentY = e.clientY - d.offsetY;
    };

    const onUp = () => finalizeDrag();

    // pointercancel: fired on mobile when OS steals the touch (notifications, gestures)
    const onCancel = () => finalizeDrag();

    // If user backgrounds the tab mid-drag, finalize to prevent orphan state
    const onVisChange = () => {
      if (document.hidden) finalizeDrag();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    document.addEventListener("visibilitychange", onVisChange);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("visibilitychange", onVisChange);
      cancelAnimationFrame(drag.current.rafId);

      // Clear willChange timeout
      const el = orbRef.current;
      if (el && (el as any).__wcTimeout) clearTimeout((el as any).__wcTimeout);
    };
  }, [finalizeDrag]);

  // --- Click detection ---
  const onClick = useCallback(() => {
    const d = drag.current;
    const isClick =
      !d.didMove && Date.now() - d.startTime < CLICK_THRESHOLD_MS;
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
        willChange: "auto",
      }}
      className={cn(
        "rounded-full cursor-grab active:cursor-grabbing",
        "bg-gradient-to-br from-primary via-primary/80 to-accent",
        "flex items-center justify-center",
        "shadow-xl shadow-primary/20",
        hidden && "scale-0 opacity-0 pointer-events-none",
        !hidden && "scale-100 opacity-100"
      )}
      aria-label="VINCI AI অ্যাসিস্ট্যান্ট খুলুন"
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
