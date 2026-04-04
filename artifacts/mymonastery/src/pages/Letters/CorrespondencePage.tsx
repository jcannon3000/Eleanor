import { useState, useEffect } from "react";
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

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
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
        <p className="text-[14px] text-muted-foreground mb-5">with {otherMembers}</p>

        {/* Current Period Bar */}
        <div
          className="rounded-2xl overflow-hidden mb-8"
          style={{ backgroundColor: "#F7F0E6" }}
        >
          <div className="flex">
            <div className="w-[3px] flex-shrink-0" style={{ backgroundColor: "#4A6FA5" }} />
            <div className="flex-1 p-5">
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: "#4A6FA5", letterSpacing: "0.1em" }}
              >
                Letter {currentPeriod.periodNumber} · {currentPeriod.periodLabel}
              </p>

              {/* Member status */}
              <div className="space-y-2 mb-4">
                {currentPeriod.membersWritten.map((m) => {
                  const isYou = m.email === userEmail;
                  return (
                    <div key={m.email || m.name} className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                        style={{
                          backgroundColor: m.hasWritten ? "#4A6FA5" : "transparent",
                          color: m.hasWritten ? "#F7F0E6" : "#4A6FA5",
                          border: `2px solid #4A6FA5`,
                          boxShadow: isYou ? "0 0 0 2px #4A6FA5, 0 0 0 4px #F7F0E6, 0 0 0 6px #4A6FA5" : undefined,
                        }}
                      >
                        {getInitials(m.name)}
                      </div>
                      <span className="text-sm" style={{ color: "#2C1810" }}>
                        {m.name}
                        {m.hasWritten ? (
                          <span className="text-muted-foreground"> wrote</span>
                        ) : (
                          <span className="text-muted-foreground"> hasn't written yet</span>
                        )}
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
                    Write your letter
                  </button>
                </Link>
              ) : (
                <div>
                  <p className="text-sm" style={{ color: "#6B8F71" }}>
                    Your letter is sent.
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
                  Write your letter
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {letters.map((letter) => {
              const isOwn = letter.authorEmail === userEmail;
              const readers = (letter.readBy as Array<string | number>) || [];
              const otherMemberNames = members
                .filter((m) => m.email !== letter.authorEmail)
                .filter((m) => readers.includes(m.email) || (m.id && readers.includes(m.id)))
                .map((m) => m.name || m.email.split("@")[0]);

              return (
                <Link key={letter.id} href={`/letters/${correspondenceId}/read/${letter.id}${token ? `?token=${token}` : ""}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex cursor-pointer hover:bg-[#F7F0E6]/40 transition-colors"
                  >
                    <div
                      className="w-0.5 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor: isOwn ? "#4A6FA5" : "#e8e2d9",
                      }}
                    />
                    <div className="flex-1 px-6 py-5">
                      <p
                        className="text-[11px] font-semibold uppercase mb-3"
                        style={{
                          color: "#9a9390",
                          letterSpacing: "0.1em",
                        }}
                      >
                        {letter.authorName} · Letter {letter.letterNumber} · {formatLetterDate(letter.sentAt)}
                      </p>
                      <p
                        className="text-[17px] leading-[1.9] whitespace-pre-wrap"
                        style={{
                          color: "#2C1810",
                          fontFamily: "'Space Grotesk', sans-serif",
                        }}
                      >
                        {letter.content}
                      </p>
                      {isOwn && otherMemberNames.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-4">
                          Read by {otherMemberNames.join(", ")}
                        </p>
                      )}
                    </div>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
