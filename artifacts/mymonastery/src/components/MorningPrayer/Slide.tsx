import { forwardRef } from "react";
import type { Slide as SlideData, MemberPresence } from "./types";
import { CallAndResponse } from "./CallAndResponse";

interface SlideProps {
  slide: SlideData;
  scrollBlocked: boolean;
  onScroll: () => void;
  presenceData?: MemberPresence[];
  hasLogged?: boolean;
  onLog?: () => void;
  onBack?: () => void;
  momentId?: number;
  memberToken?: string;
}

const SOIL = "#2C1810";
const CREAM = "#F7F0E6";
const SAGE = "#6B8F71";
const AMBER = "#C17F24";
const MUTED = "#9B8577";

const SEASON_LABEL: Record<string, string> = {
  advent: "Advent 🕯️",
  christmas: "Christmas 🌟",
  epiphany: "Epiphany ✨",
  lent: "Lent 🌿",
  holy_week: "Holy Week ✝️",
  easter: "Eastertide 🌸",
  season_after_pentecost: "Season after Pentecost 🌳",
};

function formatPresence(presence: MemberPresence[]): string {
  if (presence.length === 0) return "You are the first to pray today 🌿";
  if (presence.length === 1) return `${presence[0].name} has prayed this today 🌿`;
  if (presence.length === 2)
    return `${presence[0].name} and ${presence[1].name} have prayed this today 🌿`;
  return `${presence[0].name} and ${presence.length - 1} others have prayed this today 🌿`;
}

function formatLogTime(loggedAt: string | null): string {
  if (!loggedAt) return "";
  const d = new Date(loggedAt);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export const SlideView = forwardRef<HTMLDivElement, SlideProps>(
  (
    {
      slide,
      scrollBlocked,
      onScroll,
      presenceData = [],
      hasLogged = false,
      onLog,
      onBack,
    },
    ref,
  ) => {
    const isSoil = slide.type === "opening" || slide.type === "closing";
    const bg = isSoil ? SOIL : CREAM;
    const textColor = isSoil ? CREAM : SOIL;

    const containerStyle: React.CSSProperties = {
      position: "relative",
      width: "100%",
      height: "100vh",
      background: bg,
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      padding: "48px 32px",
      overflow: "hidden",
    };

    // ── OPENING ────────────────────────────────────────────────────────────────
    if (slide.type === "opening") {
      const season = slide.metadata?.season as string;
      const seasonLabel = (slide.metadata?.seasonLabel as string) ?? SEASON_LABEL[season] ?? "";
      const presenceLine = formatPresence(presenceData);

      return (
        <div style={containerStyle}>
          <div
            style={{
              margin: "auto 0",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48, textAlign: "center" }}>{slide.emoji}</div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 700,
                color: CREAM,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              {slide.content}
            </h1>
            {seasonLabel && (
              <p
                style={{
                  fontSize: 16,
                  color: AMBER,
                  fontStyle: "italic",
                  fontFamily: "Georgia, serif",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                {seasonLabel}
              </p>
            )}
            <p
              style={{
                fontSize: 14,
                color: SAGE,
                margin: 0,
                textAlign: "center",
                fontFamily: "Space Grotesk, sans-serif",
              }}
            >
              {presenceLine}
            </p>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "rgba(247,240,230,0.4)",
              textAlign: "center",
              margin: "24px 0 0",
              fontFamily: "Space Grotesk, sans-serif",
            }}
          >
            Tap to begin
          </p>
        </div>
      );
    }

    // ── CLOSING ────────────────────────────────────────────────────────────────
    if (slide.type === "closing") {
      const dateStr = slide.metadata?.date
        ? new Date(slide.metadata.date as string).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "";

      return (
        <div style={containerStyle}>
          <div
            style={{
              margin: "auto 0",
              display: "flex",
              flexDirection: "column",
              gap: 20,
              alignItems: "center",
            }}
          >
            <h1
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: CREAM,
                fontFamily: "Space Grotesk, sans-serif",
                margin: 0,
                textAlign: "center",
              }}
            >
              Morning Prayer
            </h1>
            {dateStr && (
              <p
                style={{
                  fontSize: 18,
                  color: AMBER,
                  fontFamily: "Space Grotesk, sans-serif",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                {dateStr}
              </p>
            )}

            {/* Garden section */}
            {presenceData.length > 0 && (
              <div style={{ width: "100%", marginTop: 8 }}>
                <p
                  style={{
                    fontSize: 11,
                    color: SAGE,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    textAlign: "center",
                    fontFamily: "Space Grotesk, sans-serif",
                    margin: "0 0 12px",
                  }}
                >
                  Today's Garden 🌿
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {presenceData.map((member) => (
                    <div
                      key={member.email}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          color: CREAM,
                          fontFamily: "Space Grotesk, sans-serif",
                        }}
                      >
                        {member.name ?? member.email}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: member.loggedAt ? SAGE : MUTED,
                          fontFamily: "Space Grotesk, sans-serif",
                        }}
                      >
                        {member.loggedAt
                          ? `Prayed ${formatLogTime(member.loggedAt)} 🌸`
                          : "Not yet 🌱"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Amen button */}
            <div style={{ width: "100%", marginTop: 16 }}>
              {hasLogged ? (
                <p
                  style={{
                    fontSize: 16,
                    color: SAGE,
                    textAlign: "center",
                    fontFamily: "Space Grotesk, sans-serif",
                    margin: 0,
                  }}
                >
                  🌸 You prayed this today.
                </p>
              ) : (
                <button
                  onClick={onLog}
                  style={{
                    width: "100%",
                    height: 56,
                    background: CREAM,
                    color: SOIL,
                    border: "none",
                    borderRadius: 12,
                    fontSize: 18,
                    fontWeight: 600,
                    fontFamily: "Space Grotesk, sans-serif",
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                >
                  Amen 🙏
                </button>
              )}
            </div>

            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: "none",
                  border: "none",
                  color: SAGE,
                  fontSize: 14,
                  fontFamily: "Space Grotesk, sans-serif",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                ← Back to practice
              </button>
            )}
          </div>
        </div>
      );
    }

    // ── CONTENT SLIDES ─────────────────────────────────────────────────────────

    const isLiturgicalText =
      slide.type === "opening_sentence" ||
      slide.type === "collect" ||
      slide.type === "prayer_for_mission" ||
      slide.type === "general_thanksgiving" ||
      slide.type === "creed";

    const textStyle: React.CSSProperties = isLiturgicalText
      ? {
          fontFamily: "Georgia, 'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 19,
          lineHeight: 1.9,
          color: SOIL,
          margin: 0,
          whiteSpace: "pre-wrap",
        }
      : {
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 18,
          lineHeight: 1.85,
          color: SOIL,
          margin: 0,
          whiteSpace: "pre-wrap",
        };

    return (
      <div style={containerStyle}>
        {/* Eyebrow */}
        {slide.eyebrow && (
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              color: SAGE,
              textTransform: "uppercase",
              fontFamily: "Space Grotesk, sans-serif",
              margin: "0 0 12px",
            }}
          >
            {slide.eyebrow}
          </p>
        )}

        {/* Emoji */}
        <div style={{ fontSize: 36, marginBottom: 16 }}>{slide.emoji}</div>

        {/* Title (lesson reference, collect label) */}
        {slide.title && (
          <p
            style={{
              fontSize: 15,
              color: AMBER,
              fontFamily: "Space Grotesk, sans-serif",
              fontWeight: 600,
              margin: "0 0 12px",
            }}
          >
            {slide.title}
          </p>
        )}

        {/* Contextual prompt (creed, confession) */}
        {(slide.type === "creed" || slide.type === "confession") &&
          slide.metadata?.prompt && (
            <p
              style={{
                fontSize: 15,
                color: SAGE,
                fontStyle: "italic",
                fontFamily: "Georgia, serif",
                margin: "0 0 16px",
              }}
            >
              {slide.metadata.prompt as string}
            </p>
          )}

        {/* Psalm title */}
        {slide.type === "psalm" && slide.metadata?.psalmTitle && (
          <p
            style={{
              fontSize: 14,
              color: MUTED,
              fontStyle: "italic",
              fontFamily: "Georgia, serif",
              margin: "0 0 12px",
            }}
          >
            {slide.metadata.psalmTitle as string}
          </p>
        )}

        {/* Scrollable content area */}
        <div
          ref={ref}
          onScroll={onScroll}
          style={{
            flex: 1,
            overflowY: slide.isScrollable ? "auto" : "hidden",
            WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"],
            position: "relative",
            paddingBottom: slide.isScrollable ? 48 : 0,
          }}
        >
          {/* Call-and-response */}
          {slide.isCallAndResponse && slide.callAndResponseLines ? (
            <CallAndResponse lines={slide.callAndResponseLines} />
          ) : (
            <p style={textStyle}>{slide.content}</p>
          )}

          {slide.type === "general_thanksgiving" && slide.metadata?.prompt && (
            <p
              style={{
                fontSize: 13,
                color: MUTED,
                margin: "12px 0 0",
                fontFamily: "Space Grotesk, sans-serif",
              }}
            >
              {slide.metadata.prompt as string}
            </p>
          )}

          {/* Bottom fade overlay when scrollable and blocked */}
          {slide.isScrollable && scrollBlocked && (
            <div
              style={{
                position: "sticky",
                bottom: 0,
                left: 0,
                right: 0,
                height: 64,
                background: `linear-gradient(to bottom, transparent, ${CREAM})`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        {/* Scroll hint */}
        {slide.isScrollable && slide.scrollHint && scrollBlocked && (
          <p
            style={{
              fontSize: 13,
              color: SAGE,
              textAlign: "center",
              fontFamily: "Space Grotesk, sans-serif",
              margin: "8px 0 0",
              letterSpacing: "0.03em",
            }}
          >
            {slide.scrollHint}
          </p>
        )}

        {/* BCP reference */}
        {slide.bcpReference && (
          <p
            style={{
              fontSize: 13,
              color: AMBER,
              margin: "12px 0 0",
              fontFamily: "Space Grotesk, sans-serif",
            }}
          >
            {slide.bcpReference}
          </p>
        )}
      </div>
    );
  },
);

SlideView.displayName = "SlideView";
