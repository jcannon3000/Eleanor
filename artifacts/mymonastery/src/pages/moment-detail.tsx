import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowPost {
  guestName: string | null;
  reflectionText: string | null;
  isCheckin: boolean;
}

interface MomentWindow {
  id: number;
  momentId: number;
  windowDate: string;
  status: string;
  postCount: number;
  closedAt: string | null;
  posts: WindowPost[];
}

interface MomentDetail {
  moment: {
    id: number;
    name: string;
    intention: string;
    frequency: string;
    scheduledTime: string;
    dayOfWeek?: string | null;
    windowMinutes: number;
    goalDays: number;
    currentStreak: number;
    longestStreak: number;
    totalBlooms: number;
    state: string;
    createdAt: string;
    momentToken: string;
  };
  members: { name: string | null; email: string }[];
  memberCount: number;
  myUserToken: string | null;
  windows: MomentWindow[];
  seedPosts: WindowPost[];
  todayPostCount: number;
  windowOpen: boolean;
  minutesLeft: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

function scheduleLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null): string {
  const time = formatTime(scheduledTime);
  if (frequency === "daily") return `Every day at ${time}`;
  if (frequency === "weekly" && dayOfWeek) return `Every ${DAY_NAMES[dayOfWeek] ?? dayOfWeek} at ${time}`;
  if (frequency === "weekly") return `Weekly at ${time}`;
  return `Monthly at ${time}`;
}

function goalProgress(createdAt: string, goalDays: number): number {
  const created = parseISO(createdAt);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(100, Math.round((daysSince / goalDays) * 100));
}

const STATUS_ICON: Record<string, string> = {
  bloom: "🌸",
  solo: "👤",
  wither: "🥀",
};
const STATUS_LABEL: Record<string, string> = {
  bloom: "Bloomed",
  solo: "Solo",
  wither: "Withered",
};
const STATUS_COLOR: Record<string, string> = {
  bloom: "text-[#6B8F71]",
  solo: "text-amber-600",
  wither: "text-rose-400/80",
};

// ─── Window History Entry ─────────────────────────────────────────────────────

function WindowEntry({ win }: { win: MomentWindow }) {
  const date = parseISO(win.windowDate);
  const today = new Date().toISOString().slice(0, 10);
  const isToday = win.windowDate === today;

  return (
    <div className="flex gap-4 py-3 border-b border-border/30 last:border-0">
      {/* Date column */}
      <div className="w-20 shrink-0 pt-0.5">
        <p className="text-xs font-medium text-foreground/80">{isToday ? "Today" : format(date, "MMM d")}</p>
        <p className="text-[11px] text-muted-foreground/60">{format(date, "EEEE")}</p>
      </div>

      {/* Status */}
      <div className="w-20 shrink-0 flex items-start gap-1.5 pt-0.5">
        <span className="text-base leading-none">{STATUS_ICON[win.status] ?? "·"}</span>
        <span className={`text-xs font-medium ${STATUS_COLOR[win.status] ?? "text-muted-foreground"}`}>
          {STATUS_LABEL[win.status] ?? win.status}
        </span>
      </div>

      {/* Posts */}
      <div className="flex-1">
        {win.posts.length === 0 ? (
          <p className="text-xs text-muted-foreground/50 italic">No one showed up</p>
        ) : (
          <div className="space-y-2">
            {win.posts.map((post, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-xs font-medium text-foreground/80 shrink-0 mt-0.5">
                  {(post.guestName ?? "Someone").split(" ")[0]}
                </span>
                {post.reflectionText && (
                  <p className="text-xs text-muted-foreground italic line-clamp-2">"{post.reflectionText}"</p>
                )}
                {post.isCheckin && !post.reflectionText && (
                  <span className="text-xs text-muted-foreground">✓ showed up</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const [seedText, setSeedText] = useState("");
  const [showSeedForm, setShowSeedForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: [`/api/moments/${id}`],
    queryFn: () => apiRequest<MomentDetail>("GET", `/api/moments/${id}`),
    enabled: !!user && !!id,
  });

  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/moments/${id}/seed-post`, {
      reflectionText: seedText.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setSeedText("");
      setShowSeedForm(false);
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-3 pt-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      </Layout>
    );
  }

  if (!data) return null;

  const { moment, members, memberCount, myUserToken, windows, seedPosts, todayPostCount, windowOpen, minutesLeft } = data;
  const progress = goalProgress(moment.createdAt, moment.goalDays);
  const postUrl = windowOpen && myUserToken
    ? `/moment/${moment.momentToken}/${myUserToken}`
    : null;

  const memberNames = members
    .slice(0, 4)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");
  const extraMembers = members.length > 4 ? ` +${members.length - 4}` : "";

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto">

        {/* Back */}
        <button
          onClick={() => setLocation("/moments")}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-5 transition-colors"
        >
          ← Shared Moments
        </button>

        {/* Open Now Banner */}
        {windowOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center justify-between bg-[#FFF8EC] border border-[#C17F24]/30 rounded-2xl px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-[#C17F24]">Window open now · {minutesLeft} min left</p>
              <p className="text-xs text-[#C17F24]/70 mt-0.5">{todayPostCount} of {memberCount} posted</p>
            </div>
            {postUrl && (
              <Link href={postUrl}>
                <span className="text-sm font-medium text-white bg-[#6B8F71] rounded-full px-4 py-2 hover:bg-[#5a7a60] transition-colors whitespace-nowrap">
                  Post →
                </span>
              </Link>
            )}
          </motion.div>
        )}

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground mb-1">{moment.name}</h1>
              <p className="text-sm text-muted-foreground italic mb-2">"{moment.intention}"</p>
              <p className="text-xs text-muted-foreground">
                {scheduleLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek)} · {moment.windowMinutes} min window
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.currentStreak}</p>
            <p className="text-xs text-muted-foreground mt-1">🔥 Current streak</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.longestStreak}</p>
            <p className="text-xs text-muted-foreground mt-1">⭐ Best streak</p>
          </div>
          <div className="bg-card border border-border/60 rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{moment.totalBlooms}</p>
            <p className="text-xs text-muted-foreground mt-1">🌸 Blooms</p>
          </div>
        </div>

        {/* Goal Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
              {moment.goalDays}-day goal
            </span>
            <span className="text-xs text-muted-foreground">{progress}% through</span>
          </div>
          <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#6B8F71] rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">
            {windows.filter(w => w.status === "bloom").length} blooms of {windows.length} windows so far
          </p>
        </div>

        {/* Members */}
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Members</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m, i) => (
              <span key={i} className="text-xs bg-secondary/50 border border-border/40 rounded-full px-3 py-1.5 text-foreground/80">
                {m.name ?? m.email}
              </span>
            ))}
          </div>
        </div>

        {/* Window History */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">History</span>
            <div className="flex-1 h-px bg-border/40" />
            <span className="text-xs text-muted-foreground">{windows.length} windows</span>
          </div>

          {windows.length === 0 ? (
            <div>
              {/* Plant a Seed — appears before the first window */}
              <div className="bg-[#F4F9F5] border border-[#6B8F71]/30 rounded-2xl p-5 mb-4">
                <p className="text-sm font-semibold text-[#4a6b50] mb-1">🌱 Set the tone</p>
                <p className="text-xs text-[#4a6b50]/70 mb-3">
                  No windows have opened yet. Plant a seed — share a thought or intention that inspires the group before the first window.
                </p>

                {seedPosts.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {seedPosts.map((post, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs font-medium text-[#4a6b50] shrink-0">
                          {(post.guestName ?? "Someone").split(" ")[0]}
                        </span>
                        {post.reflectionText && (
                          <p className="text-xs text-[#4a6b50]/80 italic">"{post.reflectionText}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!showSeedForm ? (
                  <button
                    onClick={() => setShowSeedForm(true)}
                    className="text-xs text-white bg-[#6B8F71] rounded-full px-4 py-2 hover:bg-[#5a7a60] transition-colors"
                  >
                    + Plant a seed
                  </button>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={seedText}
                      onChange={e => setSeedText(e.target.value)}
                      placeholder="Share a thought or intention..."
                      className="w-full text-xs rounded-xl border border-[#6B8F71]/30 bg-white p-3 resize-none h-20 focus:outline-none focus:ring-1 focus:ring-[#6B8F71]/50"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => seedMutation.mutate()}
                        disabled={seedMutation.isPending || !seedText.trim()}
                        className="text-xs text-white bg-[#6B8F71] rounded-full px-4 py-2 hover:bg-[#5a7a60] transition-colors disabled:opacity-50"
                      >
                        {seedMutation.isPending ? "Planting…" : "Plant 🌱"}
                      </button>
                      <button
                        onClick={() => setShowSeedForm(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="text-center py-6 text-muted-foreground/50">
                <p className="text-sm">First window opens at {formatTime(moment.scheduledTime)}</p>
              </div>
            </div>
          ) : (
            <div>
              {/* Seed posts shown at top of history */}
              {seedPosts.length > 0 && (
                <div className="mb-4 bg-[#F4F9F5] border border-[#6B8F71]/20 rounded-2xl px-4 py-3">
                  <p className="text-xs font-medium text-[#4a6b50] mb-2">🌱 Before the first window</p>
                  <div className="space-y-2">
                    {seedPosts.map((post, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs font-medium text-[#4a6b50] shrink-0">
                          {(post.guestName ?? "Someone").split(" ")[0]}
                        </span>
                        {post.reflectionText && (
                          <p className="text-xs text-[#4a6b50]/80 italic">"{post.reflectionText}"</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-card border border-border/60 rounded-2xl px-4 divide-y divide-border/20">
                {windows.map(win => (
                  <WindowEntry key={win.id} win={win} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
