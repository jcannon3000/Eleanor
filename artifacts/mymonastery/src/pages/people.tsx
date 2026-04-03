import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";
import { useGardenSocket } from "@/hooks/useGardenSocket";
import { Layout } from "@/components/layout";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

// Eleanor palette avatar colors: sage, amber, blush — assigned by email hash
const AVATAR_COLORS = [
  { bg: "rgba(107,143,113,0.15)", text: "#4a6e50" },  // sage
  { bg: "rgba(193,127,36,0.15)", text: "#8a5a18" },   // amber
  { bg: "rgba(212,137,106,0.15)", text: "#9a5a3a" },  // blush
];

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function relativeTimeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

// Sort: prayer requests first, then present, then by last active
function sortPeople(people: PersonSummary[], presentEmails: Set<string>): PersonSummary[] {
  return [...people].sort((a, b) => {
    const aPrayer = a.activePrayerRequest ? 1 : 0;
    const bPrayer = b.activePrayerRequest ? 1 : 0;
    if (aPrayer !== bPrayer) return bPrayer - aPrayer;
    const aPresent = presentEmails.has(a.email) ? 1 : 0;
    const bPresent = presentEmails.has(b.email) ? 1 : 0;
    if (aPresent !== bPresent) return bPresent - aPresent;
    return new Date(b.lastActiveDate).getTime() - new Date(a.lastActiveDate).getTime();
  });
}

export default function People() {
  const [location, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: people, isLoading } = usePeople(user?.id);
  const highlightEmail = new URLSearchParams(location.includes("?") ? location.split("?")[1] : "").get("highlight") ?? null;
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  // Presence
  const gardenEmails = useMemo(() => new Set((people ?? []).map(p => p.email)), [people]);
  const emptyMomentIds = useMemo(() => new Set<number>(), []);
  const { presentUsers } = useGardenSocket(user, gardenEmails, emptyMomentIds);
  const presentEmails = useMemo(() => new Set(presentUsers.map(u => u.email)), [presentUsers]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [people, highlightEmail]);

  if (authLoading || !user) return null;

  const sorted = people ? sortPeople(people, presentEmails) : [];
  const prayerBanners = sorted.filter(p => p.activePrayerRequest);

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
  };

  return (
    <Layout>
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-4xl md:text-5xl font-serif text-foreground tracking-tight">
            Your garden 🌿
          </h1>
          <p className="mt-3 text-base text-muted-foreground italic">
            People tending things alongside you.
          </p>
        </div>

        <div className="mb-8 h-px bg-border/60" />

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-card/50 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : !people || people.length === 0 ? (
          /* ── Empty state ─────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto py-20"
          >
            <div className="text-5xl mb-6">🌱</div>
            <h3 className="font-serif text-2xl text-foreground mb-3">Your garden is just beginning.</h3>
            <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
              Plant a practice or tradition to tend it with someone.
            </p>
            <Link
              href="/moment/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] hover:-translate-y-0.5 transition-all"
            >
              Plant something 🌿
            </Link>
          </motion.div>
        ) : (
          <motion.div variants={container} initial="hidden" animate="show">
            {/* ── Prayer request banners ─────────────────────── */}
            {prayerBanners.length > 0 && (
              <div className="mb-6 space-y-3">
                {prayerBanners.map(person => (
                  <motion.div key={`prayer-${person.email}`} variants={item}>
                    <Link
                      href="/dashboard"
                      className="block rounded-xl px-5 py-4 border border-[#D4896A]/20"
                      style={{ backgroundColor: "rgba(212,137,106,0.06)" }}
                    >
                      <p className="text-[15px] font-medium" style={{ color: "#D4896A" }}>
                        🙏 {person.name.split(" ")[0]} is asking for prayer
                      </p>
                      {person.activePrayerRequest && (
                        <p className="text-[13px] mt-1 italic" style={{ color: "#D4896A", opacity: 0.75 }}>
                          {truncate(person.activePrayerRequest.body, 80)}
                        </p>
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}

            {/* ── People list ────────────────────────────────── */}
            <div>
              {sorted.map((person, idx) => {
                const isHighlighted = highlightEmail === person.email;
                const isExpanded = expandedEmail === person.email;
                const isPresent = presentEmails.has(person.email);
                const color = colorFor(person.email);
                const allItems = [
                  ...person.sharedPractices.map(p => ({ type: "practice" as const, ...p })),
                  ...person.sharedTraditions.map(t => ({ type: "tradition" as const, ...t, currentStreak: 0, templateType: null })),
                ];
                const visiblePills = allItems.slice(0, 3);
                const moreCount = allItems.length - 3;
                const inactiveDays = daysSince(person.lastActiveDate);

                return (
                  <motion.div
                    key={person.email}
                    variants={item}
                    ref={isHighlighted ? highlightRef : null}
                  >
                    {/* Row */}
                    <button
                      onClick={() => setExpandedEmail(isExpanded ? null : person.email)}
                      className={`w-full text-left flex items-start gap-4 py-5 px-4 transition-colors duration-150 hover:bg-card/40 ${
                        isHighlighted ? "bg-primary/5" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-semibold flex-shrink-0"
                        style={{ backgroundColor: color.bg, color: color.text }}
                      >
                        {initials(person.name)}
                      </div>

                      {/* Center */}
                      <div className="flex-1 min-w-0">
                        {/* Line 1: Name */}
                        <h3 className="font-semibold text-[17px] text-foreground truncate">
                          {person.name}
                        </h3>

                        {/* Line 2: Practice/tradition pills */}
                        {visiblePills.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {visiblePills.map((item, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 text-xs rounded-md px-2.5 py-0.5"
                                style={{
                                  backgroundColor: item.type === "practice" ? "rgba(107,143,113,0.1)" : "rgba(193,127,36,0.1)",
                                  color: item.type === "practice" ? "#4a6e50" : "#8a5a18",
                                }}
                              >
                                {item.type === "practice" ? "🌿" : "🌱"}
                                <span className="truncate max-w-[130px]">{truncate(item.name, 18)}</span>
                              </span>
                            ))}
                            {moreCount > 0 && (
                              <span className="text-xs text-muted-foreground/50 self-center">
                                +{moreCount} more
                              </span>
                            )}
                          </div>
                        )}

                        {/* Line 3: Prayer request line */}
                        {person.activePrayerRequest && (
                          <p className="mt-1.5 text-[13px] italic" style={{ color: "#D4896A" }}>
                            🙏 Asking for prayer · {truncate(person.activePrayerRequest.body, 40)}
                          </p>
                        )}

                        {/* Line 3 alt: Inactive nudge */}
                        {!person.activePrayerRequest && inactiveDays >= 7 && (
                          <p className="mt-1.5 text-[13px]" style={{ color: "#C17F24", opacity: 0.7 }}>
                            💧 Hasn't practiced in a while
                          </p>
                        )}
                      </div>

                      {/* Right: presence or chevron */}
                      <div className="flex-shrink-0 pt-1">
                        {isPresent ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-2 h-2 rounded-full"
                              style={{
                                backgroundColor: "#6B8F71",
                                animation: "presence-dot-pulse 2s ease-in-out infinite",
                              }}
                            />
                            <span className="text-xs font-medium" style={{ color: "#6B8F71" }}>
                              Here now 🌿
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-lg">→</span>
                        )}
                      </div>
                    </button>

                    {/* Expanded accordion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-6 pl-20 space-y-5">
                            {/* Shared practices */}
                            {person.sharedPractices.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#6B8F71" }}>
                                  Practices together
                                </p>
                                <div className="space-y-2">
                                  {person.sharedPractices.map(practice => (
                                    <Link
                                      key={practice.id}
                                      href={`/moments/${practice.id}`}
                                      className="flex items-center justify-between py-1.5 group/row"
                                    >
                                      <span className="text-sm text-foreground/80 group-hover/row:text-foreground transition-colors">
                                        {practice.templateType === "intercession" ? "🙏" : practice.templateType === "contemplative" ? "🕯️" : practice.templateType === "morning-prayer" ? "✨" : practice.templateType === "evening-prayer" ? "🌙" : practice.templateType === "fasting" ? "🌿" : "🌱"}{" "}
                                        {practice.name}
                                      </span>
                                      <span className="text-xs" style={{ color: "#6B8F71" }}>
                                        {practice.currentStreak > 0
                                          ? `🔥 ${practice.currentStreak} day${practice.currentStreak !== 1 ? "s" : ""}`
                                          : "🌱 Just beginning"}
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Shared traditions */}
                            {person.sharedTraditions.length > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#C17F24" }}>
                                  Traditions together
                                </p>
                                <div className="space-y-2">
                                  {person.sharedTraditions.map(tradition => (
                                    <Link
                                      key={tradition.id}
                                      href={`/traditions/${tradition.id}`}
                                      className="flex items-center py-1.5 text-sm text-foreground/80 hover:text-foreground transition-colors"
                                    >
                                      🌱 {tradition.name}
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Prayer request section */}
                            {person.activePrayerRequest && (
                              <div>
                                <p className="text-[10px] font-semibold tracking-widest uppercase mb-2" style={{ color: "#D4896A" }}>
                                  Held in prayer
                                </p>
                                <div
                                  className="rounded-lg p-3 border-l-2"
                                  style={{
                                    backgroundColor: "rgba(212,137,106,0.04)",
                                    borderLeftColor: "#D4896A",
                                  }}
                                >
                                  <p className="text-sm text-foreground/80 leading-relaxed">
                                    {person.activePrayerRequest.body}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Invite link */}
                            <Link
                              href="/moment/new"
                              className="inline-block text-[13px] font-medium transition-colors hover:opacity-80"
                              style={{ color: "#6B8F71" }}
                            >
                              + Invite {person.name.split(" ")[0]} to something new 🌿
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Bottom divider */}
                    {idx < sorted.length - 1 && (
                      <div className="h-px mx-4" style={{ backgroundColor: "rgba(44,24,16,0.06)" }} />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
