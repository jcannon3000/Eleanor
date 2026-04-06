import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, isTomorrow, isThisWeek, parseISO } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isThisWeek(date)) return format(date, "EEEE");
  return format(date, "EEE, MMM d");
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/letters/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#FAF6F0", border: "1px solid rgba(74,111,165,0.25)", minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: "#2C1810" }}>📮 Start a correspondence</p>
              <p className="text-xs mt-0.5" style={{ color: "#9a9390" }}>Write letters with someone</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#FAF6F0", border: "1px solid rgba(193,127,36,0.25)", minWidth: 220 }}
            >
              <p className="text-sm font-semibold" style={{ color: "#2C1810" }}>⛪ Start a gathering</p>
              <p className="text-xs mt-0.5" style={{ color: "#9a9390" }}>Meet together regularly</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#2C1810", color: "#F7F0E6" }}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </button>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "#D6CAB8" }} />
    </div>
  );
}

// ─── Letters Section ──────────────────────────────────────────────────────────

function LettersSection() {
  const { user } = useAuth();
  const { data: correspondences, isLoading } = useQuery<Array<{
    id: number;
    name: string;
    groupType: string;
    unreadCount: number;
    members: Array<{ name: string | null; email: string; homeCity: string | null }>;
    recentPostmarks: Array<{ authorName: string; city: string; sentAt: string }>;
    currentPeriod: {
      periodNumber: number;
      periodLabel: string;
      hasWrittenThisPeriod: boolean;
      isLastThreeDays: boolean;
      membersWritten: Array<{ name: string; hasWritten: boolean }>;
    };
  }>>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <>
        <SectionHeader label="Letters 📮" />
        <div className="space-y-3 mb-8">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#F0EAE0" }} />
          ))}
        </div>
      </>
    );
  }

  const items = correspondences ?? [];

  return (
    <div className="mb-8">
      <SectionHeader label="Letters 📮" />

      {items.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: "#F7F0E6", border: "1px dashed #C8B99A" }}
        >
          <p className="text-sm mb-3" style={{ color: "#6b6460" }}>No letters yet. Start a correspondence. 📮</p>
          <Link href="/letters/new">
            <span className="text-sm font-semibold" style={{ color: "#4A6FA5" }}>Start writing →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const isOneToOne = c.groupType === "one_to_one";
            const otherMembers = c.members
              .filter(m => m.email !== user?.email)
              .map(m => m.name || m.email.split("@")[0])
              .join(", ");

            const iWrote = c.currentPeriod.membersWritten.find(m => m.name === user?.name)?.hasWritten ?? false;
            const theyWrote = c.currentPeriod.membersWritten.find(m => m.name !== user?.name)?.hasWritten ?? false;
            const hasUnread = c.unreadCount > 0;
            const needsWrite = !iWrote;

            let statusText = "";
            let statusColor = "#9a9390";

            if (hasUnread) {
              statusText = `${otherMembers} wrote 🌿`;
              statusColor = "#4A6FA5";
            } else if (iWrote && !theyWrote) {
              statusText = isOneToOne ? `Waiting for ${otherMembers}... 🌿` : `Your update is in 🌿`;
              statusColor = "#9a9390";
            } else if (needsWrite) {
              statusText = isOneToOne ? `Your turn to write 📮` : `Share your update 📮`;
              statusColor = "#4A6FA5";
            } else {
              statusText = "All written 🌿";
              statusColor = "#6B8F71";
            }

            const lastPostmark = c.recentPostmarks[0];

            return (
              <Link key={c.id} href={`/letters/${c.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  style={{ background: "#FAF6F0", border: `1px solid rgba(74,111,165,0.2)` }}
                >
                  {/* Ink left bar */}
                  <div className="w-1 flex-shrink-0" style={{ background: "#4A6FA5" }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-base font-semibold" style={{ color: "#2C1810" }}>
                          {c.name || (isOneToOne ? `Letters with ${otherMembers}` : otherMembers)}
                        </span>
                        {hasUnread && (
                          <span
                            className="ml-2 inline-block w-2 h-2 rounded-full align-middle"
                            style={{ background: "#4A6FA5" }}
                          />
                        )}
                      </div>
                      <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#4A6FA5", letterSpacing: "0.08em" }}>
                        {isOneToOne ? `Letter ${c.currentPeriod.periodNumber}` : `Week ${c.currentPeriod.periodNumber}`}
                      </span>
                    </div>

                    <p className="text-sm mt-1 font-medium" style={{ color: statusColor }}>
                      {statusText}
                    </p>

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px]" style={{ color: "#9a9390" }}>
                        {c.currentPeriod.periodLabel}
                        {lastPostmark?.city ? ` · ${lastPostmark.city}` : ""}
                      </span>
                      {needsWrite && (
                        <Link
                          href={`/letters/${c.id}/write`}
                          onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        >
                          <span
                            className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0"
                            style={{ background: "#4A6FA5", color: "#fff" }}
                          >
                            Write 📮
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Gatherings Section ───────────────────────────────────────────────────────

function GatheringsSection() {
  const { user } = useAuth();
  const { data: rituals, isLoading } = useListRituals({ ownerId: user?.id });

  if (isLoading) {
    return (
      <>
        <SectionHeader label="Gatherings ⛪" />
        <div className="space-y-3 mb-8">
          {[1].map(i => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#F0EAE0" }} />
          ))}
        </div>
      </>
    );
  }

  const gatherings = rituals ?? [];

  return (
    <div className="mb-8">
      <SectionHeader label="Gatherings ⛪" />

      {gatherings.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center"
          style={{ background: "#F7F0E6", border: "1px dashed #C8B99A" }}
        >
          <p className="text-sm mb-3" style={{ color: "#6b6460" }}>No gatherings yet. Start one. ⛪</p>
          <Link href="/tradition/new">
            <span className="text-sm font-semibold" style={{ color: "#C17F24" }}>Start a gathering →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {gatherings.map((ritual) => {
            const next = ritual.nextMeetupDate ? parseISO(ritual.nextMeetupDate) : null;
            const r = ritual as any;
            const rhythm = r.rhythm as string | undefined;
            const rhythmLabel = rhythm === "weekly" ? "Every week"
              : rhythm === "fortnightly" ? "Every two weeks"
              : rhythm === "monthly" ? "Once a month"
              : ritual.frequency ?? "Recurring";

            return (
              <Link key={ritual.id} href={`/ritual/${ritual.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  style={{ background: "#FAF6F0", border: "1px solid rgba(193,127,36,0.2)" }}
                >
                  {/* Amber left bar */}
                  <div className="w-1 flex-shrink-0" style={{ background: "#C17F24" }} />
                  <div className="flex-1 p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-base font-semibold" style={{ color: "#2C1810" }}>{ritual.name}</span>
                      <span className="text-[11px]" style={{ color: "#9a9390" }}>{rhythmLabel}</span>
                    </div>

                    {ritual.participants && (ritual.participants as any[]).length > 0 && (
                      <p className="text-sm mb-1" style={{ color: "#6b6460" }}>
                        with {(ritual.participants as any[]).slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
                        {(ritual.participants as any[]).length > 3 && ` +${(ritual.participants as any[]).length - 3}`}
                      </p>
                    )}

                    {next && (
                      <p className="text-sm" style={{ color: "#6b6460" }}>
                        {dayLabel(next)} · {format(next, "h:mm a")}
                        {ritual.location && <> · {ritual.location}</>}
                      </p>
                    )}

                    {r.intercessionIntention && (
                      <p className="text-xs mt-1" style={{ color: "#9a9390" }}>🙏 Praying for {r.intercessionIntention}</p>
                    )}
                    {r.fastingDescription && (
                      <p className="text-xs mt-0.5" style={{ color: "#9a9390" }}>🌿 Fasting together</p>
                    )}
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full pb-24">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-widest mb-1" style={{ color: "#9a9390" }}>
            Phoebe
          </p>
          <h1 className="text-2xl font-semibold" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </h1>
        </div>

        {/* ── Letters ── */}
        <LettersSection />

        {/* ── Gatherings ── */}
        <GatheringsSection />

        {/* ── Prayer Requests ── */}
        <PrayerSection />

        {/* FAB */}
        <FAB />
      </div>
    </Layout>
  );
}
