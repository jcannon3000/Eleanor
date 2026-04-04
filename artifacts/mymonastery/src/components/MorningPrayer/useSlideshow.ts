/**
 * useSlideshow — navigation hook for Morning Prayer tap-forward slideshow.
 *
 * Tap right half of screen → advance
 * Tap left half            → go back
 * Swipe left               → advance
 * Swipe right              → go back
 * Keyboard: ArrowRight / Space → advance, ArrowLeft → back
 *
 * Scrollable slides: advance is blocked until the user has scrolled
 * the content to the bottom (within 50px).
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSlideshowOptions {
  total: number;
  scrollableSlides: Set<number>;
}

export type SlideDirection = "forward" | "back" | null;

export function useSlideshow({ total, scrollableSlides }: UseSlideshowOptions) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState<SlideDirection>(null);
  const [scrollBlocked, setScrollBlocked] = useState(false);

  // Ref to the scrollable content div for the current slide
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Touch tracking
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isScrollingVertically = useRef(false);

  const isScrollable = scrollableSlides.has(currentIndex);

  // Check if current scrollable slide is scrolled to bottom
  const checkScrolledToBottom = useCallback(() => {
    if (!isScrollable || !contentRef.current) return true;
    const el = contentRef.current;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
  }, [isScrollable]);

  // Recheck scroll state whenever content ref changes or slide changes
  useEffect(() => {
    if (!isScrollable) {
      setScrollBlocked(false);
      return;
    }
    // When navigating to a scrollable slide, check if it even needs scrolling
    const el = contentRef.current;
    if (!el) {
      setScrollBlocked(true);
      return;
    }
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50;
    setScrollBlocked(!atBottom);
  }, [currentIndex, isScrollable]);

  const handleScroll = useCallback(() => {
    if (!isScrollable) return;
    setScrollBlocked(!checkScrolledToBottom());
  }, [isScrollable, checkScrolledToBottom]);

  const advance = useCallback(() => {
    if (scrollBlocked) return;
    if (currentIndex >= total - 1) return;
    setDirection("forward");
    setCurrentIndex((i) => i + 1);
  }, [scrollBlocked, currentIndex, total]);

  const goBack = useCallback(() => {
    if (currentIndex <= 0) return;
    setDirection("back");
    setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const goTo = useCallback((index: number) => {
    if (index < 0 || index >= total) return;
    setDirection(index > currentIndex ? "forward" : "back");
    setCurrentIndex(index);
  }, [currentIndex, total]);

  // Pointer click handler — split screen left/right
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      // Ignore clicks on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, textarea, [role=button]")) return;

      const width = e.currentTarget.clientWidth;
      if (e.clientX > width / 2) {
        advance();
      } else {
        goBack();
      }
    },
    [advance, goBack],
  );

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isScrollingVertically.current = false;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      if (isScrollingVertically.current) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }

      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0);

      // If vertical movement is larger, it was a scroll
      if (Math.abs(dy) > Math.abs(dx)) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      }

      if (Math.abs(dx) > 50) {
        if (dx < 0) {
          advance(); // swipe left → forward
        } else {
          goBack(); // swipe right → back
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    },
    [advance, goBack],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current);
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (dy > dx && dy > 10) {
      isScrollingVertically.current = true;
    }
  }, []);

  // Keyboard handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goBack]);

  return {
    currentIndex,
    direction,
    scrollBlocked,
    isScrollable,
    contentRef,
    handleClick,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleScroll,
    advance,
    goBack,
    goTo,
  };
}
