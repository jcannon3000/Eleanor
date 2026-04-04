import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

interface CorrespondenceMemberStatus {
  name: string;
  hasWritten: boolean;
}

interface PostmarkData {
  authorName: string;
  city: string;
  sentAt: string;
}

interface UnreadPreview {
  authorName: string;
  content: string;
  postmarkCity: string | null;
}

interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{
    name: string | null;
    email: string;
    joinedAt: string | null;
    lastLetterAt: string | null;
    homeCity: string | null;
  }>;
  letterCount: number;
  unreadCount: number;
  recentPostmarks: PostmarkData[];
  unreadPreview: UnreadPreview | null;
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: CorrespondenceMemberStatus[];
    isLastThreeDays: boolean;
  };
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatPeriodRange(start: string, end: string): string {
  return `${formatShortDate(start)} \u2013 ${formatShortDate(end)}`;
}

function PostmarkStamp({ city, date, rotation = -8 }: { city: string; date: string; rotation?: number }) {
  return (
    <div
      className="inline-flex flex-col items-center justify-center flex-shrink-0"
      style={{
        border: "1px solid #6B8F71",
        borderRadius: "50% / 40%",
        padding: "4px 10px",
        transform: `rotate(${rotation}deg)`,
        minWidth: "60px",
      }}
    >
      <span
        className="font-semibold uppercase"
        style={{ color: "#6B8F71", fontSize: "9px", letterSpacing: "0.08em", lineHeight: 1.2 }}
      >
        {city}
      </span>
      <span style={{ color: "#6B8F71", fontSize: "8px", lineHeight: 1.2 }}>
        {formatShortDate(date)}
      </span>
    </div>
  );
}

function CorrespondenceCard({ item, userName }: { item: CorrespondenceItem; userName: string }) {
  const { currentPeriod } = item;

  // Status text
  let statusText = "";
  let statusColor = "#9a9390";
  if (!currentPeriod.hasWrittenThisPeriod) {
    if (currentPeriod.isLastThreeDays) {
      statusText = "Write your letter \u{1F4EE}";
      statusColor = "#C17F24";
    }
  } else {
    const allWritten = currentPeriod.membersWritten.every((m) => m.hasWritten);
    if (allWritten) {
      statusText = "All letters in \u{1F338}";
      statusColor = "#6B8F71";
    } else {
      const waiting = currentPeriod.membersWritten.find(
        (m) => !m.hasWritten && m.name !== userName,
      );
      statusText = `Waiting for ${waiting?.name || "others"}... \u{1F33F}`;
      statusColor = "#6B8F71";
    }
  }

  const otherMembers = item.members
    .filter((m) => m.name !== userName)
    .map((m) => m.name || m.email?.split("@")[0])
    .join(", ");

  return (
    <Link href={`/letters/${item.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative cursor-pointer transition-shadow hover:shadow-md active:scale-[0.99] transition-transform"
        style={{
          backgroundColor: "#FAF6F0",
          border: "1px solid rgba(107, 143, 113, 0.25)",
          borderRadius: "4px",
          borderLeft: "3px solid #6B8F71",
          boxShadow: "0 2px 8px rgba(44, 24, 16, 0.06)",
          padding: "24px",
          marginBottom: "20px",
        }}
      >
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-bold truncate" style={{ color: "#2C1810" }}>
              {item.name}
            </p>
            <p className="text-[14px] text-muted-foreground truncate">
              with {otherMembers}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p
              className="text-[10px] font-semibold uppercase"
              style={{ color: "#6B8F71", letterSpacing: "0.08em" }}
            >
              Letter {currentPeriod.periodNumber}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatPeriodRange(currentPeriod.periodStart, currentPeriod.periodEnd)}
            </p>
          </div>
        </div>

        {/* Postmark stamps */}
        {item.recentPostmarks.length > 0 && (
          <div className="flex justify-end gap-2 mt-3 -mr-2">
            {item.recentPostmarks.slice(0, 2).map((pm, i) => (
              <PostmarkStamp
                key={i}
                city={pm.city}
                date={pm.sentAt}
                rotation={i === 0 ? -8 : 6}
              />
            ))}
          </div>
        )}

        {/* Unread letter preview */}
        {item.unreadPreview && (
          <div
            className="mt-3"
            style={{
              backgroundColor: "#F7F0E6",
              borderLeft: "2px solid #6B8F71",
              padding: "12px 16px",
              borderRadius: "0 4px 4px 0",
            }}
          >
            <p
              className="text-[11px] font-semibold uppercase mb-1"
              style={{ color: "#6B8F71", letterSpacing: "0.08em" }}
            >
              {item.unreadPreview.authorName} wrote {item.unreadPreview.postmarkCity ? `from ${item.unreadPreview.postmarkCity}` : ""} {"\u{1F33F}"}
            </p>
            <p className="text-[15px]" style={{ color: "#2C1810" }}>
              {item.unreadPreview.content}{item.unreadPreview.content.length >= 120 ? "..." : ""}
            </p>
            <p
              className="text-[12px] font-medium mt-2 text-right"
              style={{ color: "#6B8F71" }}
            >
              Read letter &rarr;
            </p>
          </div>
        )}

        {/* Status row */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-3">
            {currentPeriod.membersWritten.map((m) => (
              <span key={m.name} className="flex items-center gap-1 text-[13px]">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{
                    backgroundColor: m.hasWritten ? "#6B8F71" : "transparent",
                    border: `1.5px solid #6B8F71`,
                  }}
                />
                <span style={{ color: "#2C1810" }}>{m.name}</span>
              </span>
            ))}
          </div>
          {statusText && (
            <span className="text-[13px]" style={{ color: statusColor }}>
              {statusText}
            </span>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export default function LettersPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: correspondences, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const items = correspondences ?? [];
  const isEmpty = !isLoading && items.length === 0;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-24">
        {/* Header */}
        <div className="mb-2">
          <div className="flex items-center justify-between">
            <h1
              className="text-[28px] font-bold"
              style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Letters {"\u{1F4EE}"}
            </h1>
            {!isEmpty && (
              <Link href="/letters/new">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: "#6B8F71" }}
                >
                  + New
                </span>
              </Link>
            )}
          </div>
          <p className="text-[15px] italic mt-1" style={{ color: "#6B8F71" }}>
            One letter every week.
            {"\n"}A practice of staying close.
          </p>
        </div>

        {/* Ink rule */}
        <div className="mb-6" style={{ borderTop: "1px solid #6B8F71", opacity: 0.3 }} />

        {isLoading ? (
          <div className="space-y-5">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="h-32 rounded animate-pulse"
                style={{ backgroundColor: "#F7F0E6", border: "1px solid rgba(107,143,113,0.1)" }}
              />
            ))}
          </div>
        ) : isEmpty ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-12"
          >
            <div className="text-5xl mb-6">{"\u{1F4EE}"}</div>
            <p className="text-base mb-1" style={{ color: "#2C1810" }}>No letters yet.</p>
            <p className="text-sm text-muted-foreground mb-8">
              Start a correspondence and write your first letter.
            </p>

            {/* Ghost card preview */}
            <div
              className="w-full max-w-sm mb-8"
              style={{
                opacity: 0.35,
                pointerEvents: "none",
                backgroundColor: "#FAF6F0",
                border: "1px solid rgba(107, 143, 113, 0.25)",
                borderRadius: "4px",
                borderLeft: "3px solid #6B8F71",
                boxShadow: "0 2px 8px rgba(44, 24, 16, 0.06)",
                padding: "24px",
              }}
            >
              <p className="text-[18px] font-bold" style={{ color: "#2C1810" }}>
                Letters with a friend
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span className="flex items-center gap-1 text-[13px]" style={{ color: "#9a9390" }}>
                  <span className="inline-block w-2 h-2 rounded-full border" style={{ borderColor: "#6B8F71" }} />
                  You
                </span>
                <span className="flex items-center gap-1 text-[13px]" style={{ color: "#9a9390" }}>
                  <span className="inline-block w-2 h-2 rounded-full border" style={{ borderColor: "#6B8F71" }} />
                  Them
                </span>
              </div>
              <p className="text-[14px] italic mt-3" style={{ color: "#9a9390" }}>
                Your first letter is waiting to be written...
              </p>
            </div>

            <Link href="/letters/new">
              <button
                className="px-6 py-3.5 rounded-2xl text-base font-semibold"
                style={{ backgroundColor: "#6B8F71", color: "#F7F0E6" }}
              >
                + Start a correspondence {"\u{1F4EE}"}
              </button>
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {/* Prominent write CTA if any correspondence needs a letter */}
            {(() => {
              const needsLetter = items.find((i) => !i.currentPeriod.hasWrittenThisPeriod);
              if (!needsLetter) return null;
              return (
                <Link href={`/letters/${needsLetter.id}/write`}>
                  <div
                    className="mb-6 p-5 rounded-2xl text-center cursor-pointer hover:shadow-md transition-shadow"
                    style={{
                      backgroundColor: "#6B8F71",
                      color: "#F7F0E6",
                      boxShadow: "0 4px 16px rgba(107, 143, 113, 0.3)",
                    }}
                  >
                    <p className="text-lg font-semibold">Write your letter {"\u{1F4EE}"}</p>
                    <p className="text-sm opacity-80 mt-1">
                      {needsLetter.name} · Letter {needsLetter.currentPeriod.periodNumber}
                    </p>
                  </div>
                </Link>
              );
            })()}

            {items.map((item) => (
              <CorrespondenceCard key={item.id} item={item} userName={user.name} />
            ))}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
