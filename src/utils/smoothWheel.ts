import { useEffect, useRef } from 'react';

// Animates mouse-wheel scrolling on a container so each notch GLIDES to its
// target instead of jumping in discrete ~3-line steps (the stock Windows
// mouse-wheel feel). Trackpads already scroll smoothly via the OS, so their
// pixel-momentum streams are left untouched — we only take over a real wheel
// step (line-mode delta, or a chunky pixel jump).
//
// Implementation: a wheel notch adds its distance to a `target` scroll offset;
// a rAF loop eases scrollTop toward that target each frame. Notches that land
// mid-glide accumulate, so spinning the wheel fast scrolls farther/faster.
//
// `disabled()` lets the caller bow out entirely — used while a drag is in
// progress so @dnd-kit's edge autoscroll keeps sole control of scrollTop and
// the two animation loops never fight over the same property.
export function useSmoothWheel(
  ref: React.RefObject<HTMLElement | null>,
  opts?: { disabled?: () => boolean }
) {
  // Kept in a ref so the (once-only) effect always sees the latest closure
  // without re-binding the listener every render.
  const disabledRef = useRef(opts?.disabled);
  disabledRef.current = opts?.disabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honour the OS "reduce motion" setting — fall back to native stepping.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Easing factor per frame. 0.22 → reaches the target in ~12 frames
    // (~200ms): a glide that still feels immediate, not a slow crawl.
    const EASE = 0.22;
    // Line-mode deltas (Firefox, some mice) report whole lines, not pixels;
    // ~32px/line keeps a 3-line notch ≈ the pixel-mode jump other browsers send.
    const LINE_PX = 32;

    let raf = 0;
    let target = el.scrollTop;
    let animating = false;

    const tick = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (target < 0) target = 0;
      else if (target > max) target = max;
      const diff = target - el.scrollTop;
      if (Math.abs(diff) < 0.5) {
        el.scrollTop = target;
        animating = false;
        raf = 0;
        return;
      }
      el.scrollTop += diff * EASE;
      raf = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      if (disabledRef.current?.()) return; // e.g. a drag is active
      if (e.ctrlKey) return; // pinch-zoom gesture, not a scroll
      if (e.deltaY === 0) return;

      // Trackpads stream small pixel deltas with built-in momentum — leave
      // those to the browser. A line-mode delta or a sizeable pixel step is
      // the discrete mouse-wheel notch we want to animate.
      const lineMode = e.deltaMode === 1;
      if (!lineMode && Math.abs(e.deltaY) < 50) return;

      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) return; // nothing to scroll (e.g. mobile: page scrolls)

      // At an edge and pushing further out: let the event bubble so an outer
      // scroller can take over instead of swallowing it here.
      if ((el.scrollTop <= 0 && e.deltaY < 0) || (el.scrollTop >= max - 0.5 && e.deltaY > 0)) {
        return;
      }

      e.preventDefault();
      // Re-seed from the live position when starting fresh so a glide that was
      // interrupted (scrollbar drag, keyboard) doesn't carry a stale offset.
      if (!animating) target = el.scrollTop;
      target += lineMode ? e.deltaY * LINE_PX : e.deltaY;
      animating = true;
      if (!raf) raf = requestAnimationFrame(tick);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}
