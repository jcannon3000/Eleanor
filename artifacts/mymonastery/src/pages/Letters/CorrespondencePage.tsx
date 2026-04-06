import { useEffect, useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  authorEmail: string;
  authorName: string;
  content: string;
  letterNumber: number;
  periodNumber: number;
  periodStartDate: string;
  postmarkCity: string | null;
  sentAt: string;
  readBy: Array<string | number>;
}

interface CorrespondenceDetail {
  id: number;
  name: string;
  groupType: string;
  startedAt: string;
  members: Array<{ id: number; name: string | null; email: string; joinedAt: string | null; lastLetterAt: string | null; homeCity: string | null }>;
  letters: LetterData[];
  myTurn: boolean;
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: MemberStatus[];
    isLastThreeDays: boolean;
    whoseTurn?: "creator" | "member" | "everyone";
  };
}

function formatLetterDate(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function PostmarkStamp({ city, date }: { city: string; date: string }) {
  return (
    <div
      className="inline-flex flex-col items-center justify-center flex-shrink-0"
      style={{ border: "1.5px solid #4A6FA5", borderRadius: "50% / 40%", padding: "5px 10px", transform: "rotate(-8deg)", minWidth: 64 }}
    >
      <span className="font-semibold uppercase" style={{ color: "#4A6FA5", fontSize: "9px", letterSpacing: "0.1em", lineHeight: 1.2 }}>
        {city}
      </span>
      <span style={{ color: "#4A6FA5", fontSize: "8px", lineHeight: 1.3 }}>{formatShortDate(date)}</span>
    </div>
  );
}

export default function CorrespondencePage() {
  const [, params] = useRoute("/letters/:id");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const correspondenceId = params?.id;
  const token = new URLSearchParams(window.location.search).get("token");
  const tokenParam = token ? `?token=${token}` : "";

  const queryClient = useQueryClient();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Try phoebe endpoint, fall back to legacy
  const queryKey = [`/api/phoebe/correspondences/${correspondenceId}`];
  const { data, isLoading } = useQuery<CorrespondenceDetail>({
    queryKey,
    queryFn: async () => {
      try {
        return await apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}${tokenParam}`);
      } catch {
        return await apiRequest("GET", `/api/letters/correspondences/${correspondenceId}${tokenParam}`);
      }
    },
    enabled: !!correspondenceId && (!!user || !!token),
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/phoebe/correspondences/${correspondenceId}/archive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      setLocation("/letters");
    },
  });

  // Mark as read on mount
  useEffect(() => {
    if (!correspondenceId || (!user && !token)) return;
    apiRequest("GET", `/api/phoebe/correspondences/${correspondenceId}/letters${tokenParam}`)
      .catch(() => apiRequest("GET", `/api/letters/correspondences/${correspondenceId}/letters${tokenParam}`))
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/phoebe/correspondences"] });
        queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      })
      .catch(() => {});
  }, [correspondenceId, user, token]);

  useEffect(() => {
    if (!authLoading && !user && !token) setLocation("/");
  }, [user, authLoading, token]);

  if (authLoading && !token) return null;
  if (!user && !token) return null;

  const userEmail = user?.email || "";
  const writeUrl = `/letters/${correspondenceId}/write${tokenParam}`;

  if (isLoading || !data) {
    return (
      <Layout>
        <div className="flex flex-col w-full pb-24">
          {[1, 2].map((i) => <div key={i} className="h-32 rounded-2xl animate-pulse mb-4" style={{ background: "#F0EAE0" }} />)}
        </div>
      </Layout>
    );
  }

  const { currentPeriod, letters, members } = data;
  const isOneToOne = data.groupType === "one_to_one";

  const otherMembers = members
    .filter((m) => m.email !== userEmail)
    .map((m) => m.name || m.email.split("@")[0])
    .join(", ");

  const memberCities = members.filter((m) => m.homeCity).map((m) => `${m.name || m.email.split("@")[0]} · ${m.homeCity}`);

  const periodLabel = isOneToOne
    ? `Letter ${currentPeriod.periodNumber} · ${currentPeriod.periodLabel}`
    : `Week ${currentPeriod.periodNumber} · ${currentPeriod.periodLabel}`;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-24">

        {/* Back row */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setLocation("/letters")} className="text-sm" style={{ color: "#9a9390" }}>
            ← Letters
          </button>
          {!showArchiveConfirm ? (
            <button onClick={() => setShowArchiveConfirm(true)} className="text-xs" style={{ color: "#C8B99A" }}>
              Archive
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: "#6b6460" }}>Archive this?</span>
              <button onClick={() => archiveMutation.mutate()} className="text-xs font-medium" style={{ color: "#C17F24" }}>Yes</button>
              <button onClick={() => setShowArchiveConfirm(false)} className="text-xs" style={{ color: "#9a9390" }}>Cancel</button>
            </div>
          )}
        </div>

        {/* Header */}
        <h1 className="text-2xl font-bold mb-1" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
          {data.name || (isOneToOne ? `Letters with ${otherMembers}` : otherMembers)}
        </h1>
        {isOneToOne && otherMembers && (
          <p className="text-sm mb-1" style={{ color: "#9a9390" }}>with {otherMembers}</p>
        )}
        {memberCities.length > 0 && (
          <p className="text-xs mb-5" style={{ color: "#C8B99A" }}>📮 {memberCities.join(" · ")}</p>
        )}
        {memberCities.length === 0 && <div className="mb-5" />}

        {/* Period bar */}
        <div className="rounded-xl overflow-hidden mb-8" style={{ background: "#FAF6F0", border: "1px solid rgba(74,111,165,0.2)", boxShadow: "0 2px 8px rgba(44,24,16,0.05)" }}>
          <div className="flex">
            <div className="w-[3px] flex-shrink-0" style={{ background: "#4A6FA5" }} />
            <div className="flex-1 p-5">
              <p className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "#4A6FA5", letterSpacing: "0.1em" }}>
                {periodLabel}
              </p>

              {/* Member status circles */}
              <div className="flex items-center gap-6 mb-4">
                {currentPeriod.membersWritten.map((m) => {
                  const isYou = m.email === userEmail;
                  return (
                    <div key={m.email} className="flex flex-col items-center gap-1">
                      <div
                        className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm"
                        style={{
                          borderColor: m.hasWritten ? "#4A6FA5" : "#D6CAB8",
                          background: m.hasWritten ? "#4A6FA5" : "transparent",
                          color: m.hasWritten ? "#fff" : "#9a9390",
                        }}
                      >
                        {m.hasWritten ? "✓" : ""}
                      </div>
                      <span className="text-[11px]" style={{ color: isYou ? "#4A6FA5" : "#2C1810", fontWeight: isYou ? 600 : 400 }}>
                        {isYou ? "You" : m.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              {data.myTurn && !currentPeriod.hasWrittenThisPeriod ? (
                <Link href={writeUrl}>
                  <button
                    className="w-full py-3 rounded-xl text-base font-semibold"
                    style={{ background: "#4A6FA5", color: "#fff" }}
                  >
                    {isOneToOne ? "Write your letter 📮" : "Share your update 📮"}
                  </button>
                </Link>
              ) : currentPeriod.hasWrittenThisPeriod ? (
                <p className="text-sm" style={{ color: "#6B8F71" }}>
                  {isOneToOne ? "Your letter is sent. 🌿 Waiting for their response." : "Your update is in for this week. 🌿"}
                </p>
              ) : isOneToOne ? (
                <p className="text-sm" style={{ color: "#9a9390" }}>
                  Waiting for {otherMembers} to write... 🌿
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Letter thread */}
        {letters.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-base mb-2" style={{ color: "#6b6460" }}>No letters yet.</p>
            {data.myTurn && (
              <Link href={writeUrl}>
                <button className="px-6 py-3 rounded-xl font-semibold text-sm" style={{ background: "#4A6FA5", color: "#fff" }}>
                  Write first 📮
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div>
            {letters.map((letter, index) => {
              const isOwn = letter.authorEmail === userEmail;
              const readers = (letter.readBy as Array<string | number>) || [];
              const readByOthers = members
                .filter((m) => m.email !== letter.authorEmail)
                .filter((m) => readers.includes(m.email) || (m.id && readers.includes(m.id)))
                .map((m) => m.name || m.email.split("@")[0]);

              return (
                <div key={letter.id}>
                  <Link href={`/letters/${correspondenceId}/read/${letter.id}${tokenParam}`}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="relative cursor-pointer transition-shadow hover:shadow-sm"
                      style={{
                        background: "#FAF6F0",
                        border: `1px solid rgba(74,111,165,${isOwn ? "0.2" : "0.12"})`,
                        borderLeft: `3px solid ${isOwn ? "#4A6FA5" : "#D6CAB8"}`,
                        borderRadius: "4px",
                        padding: "24px 28px",
                        boxShadow: "0 2px 8px rgba(44,24,16,0.04)",
                      }}
                    >
                      {letter.postmarkCity && isOneToOne && (
                        <div className="absolute top-4 right-4">
                          <PostmarkStamp city={letter.postmarkCity} date={letter.sentAt} />
                        </div>
                      )}

                      <p className="text-[11px] font-semibold uppercase mb-3 pr-20" style={{ color: "#9a9390", letterSpacing: "0.1em" }}>
                        {letter.authorName} · {isOneToOne ? `Letter ${letter.letterNumber}` : `Update ${letter.letterNumber}`}
                        {letter.postmarkCity ? ` · ${letter.postmarkCity}` : ""}
                        {" · "}{formatLetterDate(letter.sentAt)}
                      </p>

                      {isOneToOne && (
                        <p className="text-sm italic mb-3" style={{ color: "#9a9390", fontFamily: "Georgia, serif" }}>
                          Dear {isOwn ? otherMembers : (user?.name || "Friend")},
                        </p>
                      )}

                      <p className="text-[17px] leading-[1.9] whitespace-pre-wrap line-clamp-6" style={{ color: "#2C1810", fontFamily: isOneToOne ? "Georgia, serif" : "'Space Grotesk', sans-serif" }}>
                        {letter.content}
                      </p>

                      {isOwn && readByOthers.length > 0 && (
                        <p className="text-xs mt-3" style={{ color: "#9a9390" }}>
                          Read by {readByOthers.join(", ")} 🌿
                        </p>
                      )}
                    </motion.div>
                  </Link>

                  {index < letters.length - 1 && (
                    <div className="flex items-center justify-center py-4" style={{ color: "rgba(74,111,165,0.25)" }}>
                      <span className="text-sm tracking-[0.5em]">· · ·</span>
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
