/**
 * MorningPrayerSlideshow — tap-forward Daily Office experience.
 *
 * Fetches assembled slides from /api/office/morning, then renders
 * a full-screen Imprint-style slideshow with scroll-guarding on
 * lessons and psalms.
 */

import { useEffect, useRef, useState } from "react";
import type { Slide, OfficeDayInfo, MemberPresence } from "./types";
import { SlideView } from "./Slide";
import { ProgressBar } from "./ProgressBar";
import { useSlideshow } from "./useSlideshow";

interface MorningPrayerSlideshowProps {
  momentId: number;
  memberToken: string;
  onBack?: () => void;
}

const SOIL = "#2C1810";
const CREAM = "#F7F0E6";
const SAGE = "#6B8F71";

export function MorningPrayerSlideshow({
  momentId,
  memberToken,
  onBack,
}: MorningPrayerSlideshowProps) {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [officeDay, setOfficeDay] = useState<OfficeDayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLogged, setHasLogged] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [presenceData, setPresenceData] = useState<MemberPresence[]>([]);

  // Determine which slides are scrollable by index
  const scrollableSet = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [officeRes, logsRes] = await Promise.all([
          fetch("/api/office/morning"),
          fetch(
            `/api/moments/${momentId}/today-logs?token=${memberToken}`,
          ).catch(() => null),
        ]);

        if (!officeRes.ok) throw new Error(`HTTP ${officeRes.status}`);
        const data = await officeRes.json();

        if (cancelled) return;

        const fetchedSlides: Slide[] = data.slides ?? [];
        setSlides(fetchedSlides);
        setOfficeDay(data.officeDay ?? null);

        // Build scrollable index set
        const set = new Set<number>();
        fetchedSlides.forEach((s, i) => {
          if (s.isScrollable) set.add(i);
        });
        scrollableSet.current = set;

        // Load presence data
        if (logsRes?.ok) {
          const logsData = await logsRes.json();
          const todayLogs: MemberPresence[] = (logsData.todayLogs ?? logsData ?? []).map(
            (l: { name?: string | null; email: string; loggedAt?: string | null }) => ({
              name: l.name ?? l.email,
              email: l.email,
              loggedAt: l.loggedAt ?? null,
            }),
          );
          setPresenceData(todayLogs);

          // Check if current user already logged
          if (logsData.myLoggedAt || logsData.alreadyLogged) {
            setHasLogged(true);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load Morning Prayer:", err);
          setError("Morning Prayer is not available right now.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [momentId, memberToken]);

  const {
    currentIndex,
    direction,
    scrollBlocked,
    contentRef,
    handleClick,
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleScroll,
  } = useSlideshow({
    total: slides.length,
    scrollableSlides: scrollableSet.current,
  });

  async function handleLog() {
    setLogError(null);
    try {
      const res = await fetch(`/api/moments/${momentId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: memberToken, type: "morning_prayer" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHasLogged(true);
    } catch {
      setLogError("Something went wrong. Tap to try again.");
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    const today = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    return (
      <div
        style={{
          minHeight: "100vh",
          background: CREAM,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
        }}
      >
        <style>{`
          @keyframes mp-pulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
        `}</style>
        <div
          style={{
            fontSize: 48,
            animation: "mp-pulse 2s ease-in-out infinite",
          }}
        >
          ✨
        </div>
        <p
          style={{
            fontSize: 18,
            color: SAGE,
            fontStyle: "italic",
            fontFamily: "Georgia, serif",
            margin: 0,
            textAlign: "center",
          }}
        >
          Preparing today's office... 🌿
        </p>
        <p
          style={{
            fontSize: 14,
            color: "#9B8577",
            fontFamily: "Space Grotesk, sans-serif",
            margin: 0,
          }}
        >
          Morning Prayer · {today}
        </p>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
  if (error || slides.length === 0) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: CREAM,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 32,
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 18, color: SOIL, fontFamily: "Space Grotesk, sans-serif" }}>
          {error ?? "Morning Prayer is not available right now."}
        </p>
        <a
          href="https://bcponline.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 15,
            color: SAGE,
            fontFamily: "Space Grotesk, sans-serif",
          }}
        >
          Open bcponline.org for today's service →
        </a>
      </div>
    );
  }

  // ── Slideshow ─────────────────────────────────────────────────────────────────
  const currentSlide = slides[currentIndex];
  const isForward = direction === "forward";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: SOIL,
        overflow: "hidden",
        touchAction: "pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      {/* Progress bar */}
      <ProgressBar
        current={currentIndex}
        total={slides.length}
        currentType={currentSlide.type}
      />

      {/* Slide counter */}
      {currentSlide.type !== "opening" && currentSlide.type !== "closing" && (
        <div
          style={{
            position: "fixed",
            top: 12,
            right: 16,
            fontSize: 12,
            color: "rgba(44,24,16,0.4)",
            fontFamily: "Space Grotesk, sans-serif",
            zIndex: 90,
            pointerEvents: "none",
          }}
        >
          {currentIndex + 1} of {slides.length}
        </div>
      )}

      {/* Slide */}
      <style>{`
        .mp-slide-enter-forward {
          animation: mp-enter-forward 300ms ease forwards;
        }
        .mp-slide-enter-back {
          animation: mp-enter-back 300ms ease forwards;
        }
        @keyframes mp-enter-forward {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        @keyframes mp-enter-back {
          from { transform: translateX(-100%); }
          to   { transform: translateX(0); }
        }
      `}</style>

      <div
        key={currentSlide.id}
        className={
          direction
            ? isForward
              ? "mp-slide-enter-forward"
              : "mp-slide-enter-back"
            : undefined
        }
        style={{ width: "100%", height: "100%" }}
      >
        <SlideView
          ref={contentRef}
          slide={currentSlide}
          scrollBlocked={scrollBlocked}
          onScroll={handleScroll}
          presenceData={presenceData}
          hasLogged={hasLogged}
          onLog={handleLog}
          onBack={onBack}
          momentId={momentId}
          memberToken={memberToken}
        />
      </div>

      {/* Log error toast */}
      {logError && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: 32,
            right: 32,
            background: "#C17F24",
            color: CREAM,
            padding: "12px 16px",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "Space Grotesk, sans-serif",
            textAlign: "center",
            zIndex: 200,
          }}
          onClick={handleLog}
        >
          {logError}
        </div>
      )}
    </div>
  );
}
