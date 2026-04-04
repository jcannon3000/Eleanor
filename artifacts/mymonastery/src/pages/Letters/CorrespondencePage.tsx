import { useEffect } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

interface MemberStatus {
  name: string;
  email: string;
  hasWritten: boolean;
}

interface LetterData {
  id: number;
  correspondenceId: number;
  authorUserId: number | null;
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  periodStartDate: string;
  postmarkCity: string | null;
  postmarkCountry: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: Array<{
    id: number;
    name: string | null;
    email: string;
    joinedAt: string | null;
    lastLetterAt: string | null;
    homeCity: string | null;
  }>;
  letters: LetterData[];
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: MemberStatus[];
    isLastThreeDays: boolean;
  };
}

function formatLetterDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function PostmarkStamp({ city, date, rotation = -8, size = "medium" }: {
  city: string;
  date: string;
  rotation?: number;
  size?: "small" | "medium";
}) {
  const isSmall = size === "small";
  return (
    <div
      className="inline-flex flex-col items-center justify-center flex-shrink-0"
      style={{
        border: "1px solid #4A6FA5",
        borderRadius: "50% / 40%",
        padding: isSmall ? "4px 8px" : "6px 12px",
        transform: `rotate(${rotation}deg)`,
        minWidth: isSmall ? "50px" : "70px",
      }}
    >
      <span
        className="font-semibold uppercase"
        style={{
          color: "#4A6FA5",
          fontSize: isSmall ? "8px" : "10px",
          letterSpacing: "0.08em",
          lineHeight: 1.2,
        }}
      >
        {city}
      </span>
      <span style={{ color: "#4A6FA5", fontSize: isSmall ? "7px" : "9px", lineHeight: 1.2 }}>
        {formatShortDate(date)}
      </span>
    </div>
  );
}

export default function CorrespondencePage() {
  const [, params] = useRoute("/letters/:id");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");

  const queryKey = [`/api/letters/correspondences/${correspondenceId}`];
  const { data, isLoading } = useQuery<CorrespondenceDetail>({
    queryKey,
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/letters/correspondences/${correspondenceId}${token ? `?token=${token}` : ""}`,
      ),
    enabled: !!correspondenceId && (!!user || !!token),
  });

  // Mark letters as read on mount
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!correspondenceId || (!user && !token)) return;
    apiRequest(
      "GET",
      `/api/letters/correspondences/${correspondenceId}/letters${token ? `?token=${token}` : ""}`,
    ).then(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
    });
  }, [correspondenceId, user, token]);

  useEffect(() => {
    if (!authLoading && !user && !token) setLocation("/");
  }, [user, authLoading, token, setLocation]);

  if (authLoading && !token) return null;
  if (!user && !token) return null;

  const userEmail = user?.email || "";

  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex flex-col w-full pb-24">
          <div className="h-8 w-32 rounded bg-card animate-pulse mb-4" />
          <div className="h-32 rounded-2xl bg-card animate-pulse mb-6" />
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-48 rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  const { currentPeriod, letters, members } = data;
  const otherMembers = members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ");

  const writeUrl = `/letters/${correspondenceId}/write${token ? `?token=${token}` : ""}`;

  // Member postmark row
  const memberCities = members
    .filter((m) => m.homeCity)
    .map((m) => `${m.name || m.email.split("@")[0]} from ${m.homeCity}`);

  return (
    <Layout>
      <div className="flex flex-col w-full pb-24">
        {/* Back */}
        <Link
          href="/letters"
          className="text-sm text-muted-foreground hover:text-[#2C1810] mb-4 inline-block transition-colors"
        >
          &larr; Letters
        </Link>

        {/* Header */}
        <h1
          className="text-2xl font-bold"
          style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {data.name}
        </h1>
        <p className="text-[14px] text-muted-foreground mb-1">with {otherMembers}</p>

        {/* Member postmark cities */}
        {memberCities.length > 0 && (
          <p className="text-[13px] text-muted-foreground mb-5">
            {"\u{1F4EE}"} {memberCities.join(" \u00b7 ")}
          </p>
        )}
        {memberCities.length === 0 && <div className="mb-5" />}

        {/* Current Period Bar */}
        <div
          className="rounded overflow-hidden mb-8"
          style={{
            backgroundColor: "#FAF6F0",
            border: "1px solid rgba(74, 111, 165, 0.2)",
            boxShadow: "0 2px 8px rgba(44, 24, 16, 0.06)",
          }}
        >
          <div className="flex">
            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: "#4A6FA5" }} />
            <div className="flex-1 p-5">
              <p
                className="text-sm font-semibold uppercase tracking-wider mb-4"
                style={{ color: "#4A6FA5", letterSpacing: "0.1em" }}
              >
                Letter {currentPeriod.periodNumber} · {currentPeriod.periodLabel}
              </p>

              {/* Member status with envelope icons */}
              <div className="flex items-center gap-6 mb-4">
                {currentPeriod.membersWritten.map((m) => {
                  const isYou = m.email === userEmail;
                  return (
                    <div key={m.email || m.name} className="flex flex-col items-center gap-1">
                      <span className="text-xl">
                        {m.hasWritten ? "\u2709\uFE0F" : "\u{1F4E8}"}
                      </span>
                      <span
                        className="text-[11px]"
                        style={{
                          color: isYou ? "#4A6FA5" : "#2C1810",
                          fontWeight: isYou ? 600 : 400,
                        }}
                      >
                        {m.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Write CTA or sent confirmation */}
              {!currentPeriod.hasWrittenThisPeriod ? (
                <Link href={writeUrl}>
                  <button
                    className="w-full py-3 rounded-xl text-base font-semibold"
                    style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
                  >
                    Write your letter {"\u{1F4EE}"}
                  </button>
                </Link>
              ) : (
                <div>
                  <p className="text-sm" style={{ color: "#6B8F71" }}>
                    Your letter is sent. {"\u{1F33F}"}
                  </p>
                  {currentPeriod.isLastThreeDays && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Period closes {formatLetterDate(currentPeriod.periodEnd)}.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Letter Thread */}
        {letters.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-base text-muted-foreground mb-1">No letters yet.</p>
            <p className="text-sm text-muted-foreground mb-6">Write the first one.</p>
            {!currentPeriod.hasWrittenThisPeriod && (
              <Link href={writeUrl}>
                <button
                  className="px-6 py-3 rounded-xl font-semibold"
                  style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
                >
                  Write your letter {"\u{1F4EE}"}
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div>
            {letters.map((letter, index) => {
              const isOwn = letter.authorEmail === userEmail;
              const readers = (letter.readBy as Array<string | number>) || [];
              const otherMemberNames = members
                .filter((m) => m.email !== letter.authorEmail)
                .filter((m) => readers.includes(m.email) || (m.id && readers.includes(m.id)))
                .map((m) => m.name || m.email.split("@")[0]);

              // Find recipient names for salutation
              const recipientNames = members
                .filter((m) => m.email !== letter.authorEmail)
                .map((m) => m.name || m.email.split("@")[0]);
              const salutation = recipientNames.length <= 2
                ? recipientNames.join(" and ")
                : recipientNames.slice(0, -1).join(", ") + ", and " + recipientNames[recipientNames.length - 1];

              return (
                <div key={letter.id}>
                  <Link href={`/letters/${correspondenceId}/read/${letter.id}${token ? `?token=${token}` : ""}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative cursor-pointer hover:shadow-sm transition-shadow"
                      style={{
                        backgroundColor: "#FAF6F0",
                        border: "1px solid rgba(74, 111, 165, 0.15)",
                        borderRadius: "4px",
                        padding: "28px 32px",
                        boxShadow: "0 2px 8px rgba(44, 24, 16, 0.04)",
                      }}
                    >
                      {/* Postmark stamp — top right */}
                      {letter.postmarkCity && (
                        <div className="absolute top-4 right-4">
                          <PostmarkStamp
                            city={letter.postmarkCity}
                            date={letter.sentAt}
                            rotation={-8}
                            size="small"
                          />
                        </div>
                      )}

                      {/* Header */}
                      <p
                        className="text-[11px] font-semibold uppercase mb-4 pr-20"
                        style={{ color: "#9a9390", letterSpacing: "0.1em" }}
                      >
                        {letter.authorName} · Letter {letter.letterNumber}
                        {letter.postmarkCity ? ` · ${letter.postmarkCity}` : ""}
                        {" · "}{formatLetterDate(letter.sentAt)}
                      </p>

                      {/* Salutation */}
                      <p
                        className="text-[17px] italic mb-3"
                        style={{ color: "#6B8F71" }}
                      >
                        Dear {salutation},
                      </p>

                      {/* Content */}
                      <p
                        className="text-[17px] leading-[1.9] whitespace-pre-wrap"
                        style={{
                          color: "#2C1810",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        {letter.content}
                      </p>

                      {/* Signature */}
                      <p
                        className="text-[17px] mt-6"
                        style={{ color: "#2C1810" }}
                      >
                        &mdash; {letter.authorName}
                      </p>

                      {/* Read receipt */}
                      {isOwn && otherMemberNames.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-4">
                          Read by {otherMemberNames.join(", ")} {"\u{1F33F}"}
                        </p>
                      )}
                    </motion.div>
                  </Link>

                  {/* Divider between letters */}
                  {index < letters.length - 1 && (
                    <div
                      className="flex items-center justify-center py-4"
                      style={{ color: "rgba(74, 111, 165, 0.3)" }}
                    >
                      <span className="text-sm tracking-[0.5em]">&middot; &middot; &middot;</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
