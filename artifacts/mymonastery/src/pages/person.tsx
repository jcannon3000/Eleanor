import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// Eleanor palette avatar colors: sage, amber, blush
const AVATAR_COLORS = [
  { bg: "#6B8F71", text: "#F7F0E6" },  // sage
  { bg: "#C17F24", text: "#F7F0E6" },  // amber
  { bg: "#D4896A", text: "#F7F0E6" },  // blush
];

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function practiceEmoji(templateType: string | null): string {
  switch (templateType) {
    case "intercession": return "🙏";
    case "morning-prayer": return "✨";
    case "evening-prayer": return "🌙";
    case "contemplative": return "🕯️";
    case "fasting": return "🌿";
    default: return "🌱";
  }
}

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default function PersonProfile() {
  const [, params] = useRoute("/people/:email");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const email = params?.email ? decodeURIComponent(params.email) : undefined;
  const { data: person, isLoading, isError } = usePersonProfile(email, user?.id);
  const queryClient = useQueryClient();

  const [prayerWord, setPrayerWord] = useState("");
  const [wordSent, setWordSent] = useState(false);

  const sendWordMutation = useMutation({
    mutationFn: async ({ requestId, content }: { requestId: number; content: string }) => {
      const res = await fetch(`/api/prayer-requests/${requestId}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Failed to send word");
      return res.json();
    },
    onSuccess: () => {
      setWordSent(true);
      setPrayerWord("");
      queryClient.invalidateQueries({ queryKey: ["/api/people", email] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 space-y-8">
          <div className="h-6 w-40 bg-card/50 animate-pulse rounded" />
          <div className="h-20 bg-card/50 animate-pulse rounded-lg" />
          <div className="h-48 bg-card/50 animate-pulse rounded-lg" />
        </div>
      </Layout>
    );
  }

  if (isError || !person) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-16 text-center">
          <div className="text-4xl mb-4">🌱</div>
          <h2 className="font-serif text-2xl mb-2">Person not found</h2>
          <p className="text-muted-foreground mb-6 text-sm">This person isn't in any of your traditions or practices.</p>
          <Link href="/people" className="text-sm font-medium" style={{ color: "#6B8F71" }}>← Back to Your People</Link>
        </div>
      </Layout>
    );
  }

  const firstName = person.name.split(" ")[0];
  const color = colorFor(person.email);
  const totalTogether = person.stats.sharedCircleCount + person.stats.sharedPracticesCount;
  const prayer = person.activePrayerRequest;
  const prayerDaysLeft = prayer ? daysRemaining(prayer.expiresAt) : null;

  // Relationship summary line
  let relationshipLine = "";
  if (person.stats.sharedPracticesCount > 0 && person.stats.sharedCircleCount > 0) {
    relationshipLine = `🌿 ${person.stats.sharedPracticesCount} practice${person.stats.sharedPracticesCount !== 1 ? "s" : ""} · 🌱 ${person.stats.sharedCircleCount} tradition${person.stats.sharedCircleCount !== 1 ? "s" : ""}`;
  } else if (person.stats.sharedPracticesCount > 0) {
    relationshipLine = `🌿 ${person.stats.sharedPracticesCount} practice${person.stats.sharedPracticesCount !== 1 ? "s" : ""} together`;
  } else if (person.stats.sharedCircleCount > 0) {
    relationshipLine = `🌱 ${person.stats.sharedCircleCount} tradition${person.stats.sharedCircleCount !== 1 ? "s" : ""} together`;
  } else {
    relationshipLine = "🌱 Just connected";
  }

  // Stats summary
  const score = person.stats.score;
  const scoreLabel = score > 0
    ? `${score} session${score !== 1 ? "s" : ""} together 🌿`
    : "Just beginning 🌱";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-8 pt-4 pb-12">

        {/* Back */}
        <Link href="/people" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm w-fit">
          ← Back to Your People
        </Link>

        {/* ── Header ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex items-center gap-5">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold flex-shrink-0"
              style={{ backgroundColor: color.bg, color: color.text }}
            >
              {initials(person.name)}
            </div>
            <div>
              <h1 className="font-serif text-[28px] text-foreground leading-tight">{person.name}</h1>
              <p className="text-sm text-muted-foreground mt-1">{relationshipLine}</p>
            </div>
          </div>

          <p className="mt-4 text-sm italic" style={{ color: "#6B8F71" }}>
            {scoreLabel}
          </p>
        </motion.div>

        {/* ── Prayer Request ─────────────────────────────── */}
        {prayer && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          >
            <div className="h-px w-full" style={{ backgroundColor: "rgba(44,24,16,0.06)" }} />
            <div className="pt-6">
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: "#D4896A" }}>
                Held in prayer 🙏
              </p>

              <div
                className="border-l-[3px] pl-4 py-1"
                style={{ borderLeftColor: "#D4896A" }}
              >
                <p className="text-base text-foreground leading-relaxed">
                  {prayer.body}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  {prayerDaysLeft !== null && `${prayerDaysLeft} day${prayerDaysLeft !== 1 ? "s" : ""} remaining · `}
                  {formatDistanceToNow(parseISO(prayer.createdAt), { addSuffix: true })}
                </p>
              </div>

              {/* Response input */}
              <div className="mt-4">
                {wordSent ? (
                  <p className="text-sm italic" style={{ color: "#6B8F71" }}>
                    🌿 You left a word
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={prayerWord}
                      onChange={e => setPrayerWord(e.target.value.slice(0, 120))}
                      placeholder="Leave a word alongside this... 🌿"
                      className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-border/60 bg-background focus:outline-none focus:border-[#D4896A]/40 transition-colors placeholder:text-muted-foreground/40"
                    />
                    <button
                      onClick={() => {
                        if (prayerWord.trim()) {
                          sendWordMutation.mutate({ requestId: prayer.id, content: prayerWord.trim() });
                        }
                      }}
                      disabled={!prayerWord.trim() || sendWordMutation.isPending}
                      className="px-3 py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-30"
                      style={{ backgroundColor: "rgba(212,137,106,0.1)", color: "#D4896A" }}
                    >
                      🙏
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Shared Practices ───────────────────────────── */}
        {person.sharedPractices && person.sharedPractices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <div className="h-px w-full" style={{ backgroundColor: "rgba(44,24,16,0.06)" }} />
            <div className="pt-6">
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-4" style={{ color: "#6B8F71" }}>
                Practices together
              </p>

              <div className="space-y-1">
                {person.sharedPractices.map(practice => (
                  <Link key={practice.id} href={`/moments/${practice.id}`} className="block group">
                    <div
                      className="flex items-center gap-4 py-3 pl-4 border-l-[3px] hover:bg-card/30 transition-colors rounded-r-lg"
                      style={{ borderLeftColor: "#6B8F71" }}
                    >
                      <span className="text-lg flex-shrink-0">{practiceEmoji(practice.templateType)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[15px] text-foreground group-hover:text-[#6B8F71] transition-colors truncate">
                          {practice.name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">
                          {practice.frequency}
                          {practice.totalBlooms > 0
                            ? ` · ${practice.totalBlooms} time${practice.totalBlooms !== 1 ? "s" : ""} together`
                            : " · Not yet prayed together 🌱"}
                        </p>
                      </div>
                      {practice.currentStreak > 0 && (
                        <span className="text-xs font-medium flex-shrink-0 animate-streak-glow" style={{ color: "#C17F24" }}>
                          🔥 {practice.currentStreak}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Shared Traditions ──────────────────────────── */}
        {person.sharedRituals && person.sharedRituals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          >
            <div className="h-px w-full" style={{ backgroundColor: "rgba(44,24,16,0.06)" }} />
            <div className="pt-6">
              <p className="text-[10px] font-semibold tracking-widest uppercase mb-4" style={{ color: "#C17F24" }}>
                Traditions together
              </p>

              <div className="space-y-1">
                {person.sharedRituals.map(({ ritual }) => (
                  <Link key={ritual.id} href={`/ritual/${ritual.id}`} className="block group">
                    <div
                      className="flex items-center gap-4 py-3 pl-4 border-l-[3px] hover:bg-card/30 transition-colors rounded-r-lg"
                      style={{ borderLeftColor: "#C17F24" }}
                    >
                      <span className="text-lg flex-shrink-0">🌱</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-[15px] text-foreground group-hover:text-[#C17F24] transition-colors truncate">
                          {ritual.name}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize mt-0.5">
                          {ritual.frequency}
                          {ritual.nextMeetupDate
                            ? ` · Next: ${format(parseISO(ritual.nextMeetupDate), "EEEE, MMMM d")}`
                            : " · No upcoming date set 🌱"}
                        </p>
                      </div>
                      {ritual.status === "on_track" && (
                        <span className="text-xs flex-shrink-0" style={{ color: "#6B8F71" }}>
                          ✓ On track
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Bottom action ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <div className="h-px w-full mb-6" style={{ backgroundColor: "rgba(44,24,16,0.06)" }} />
          <Link
            href="/moment/new"
            className="text-[14px] font-medium transition-opacity hover:opacity-70"
            style={{ color: "#6B8F71" }}
          >
            + Invite {firstName} to something new 🌿
          </Link>
        </motion.div>
      </div>
    </Layout>
  );
}
