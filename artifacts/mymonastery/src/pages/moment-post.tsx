import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────
type LoggingType = "photo" | "reflection" | "both" | "checkin";

const SPIRITUAL_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "custom"]);
const BCP_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer"]);
const RRULE_DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

type MomentMember = { name: string; userToken: string; prayed: boolean };

const TIME_OF_DAY_LABELS_POST: Record<string, string> = {
  "early-morning": "early morning", morning: "morning", midday: "midday",
  afternoon: "afternoon", "late-afternoon": "late afternoon", evening: "evening", night: "night",
};
const DAY_DOW_LC: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};
const DAY_NAMES_FULL: Record<string, string> = {
  sunday: "Sunday", monday: "Monday", tuesday: "Tuesday",
  wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday",
};

function computeNextWindowLabel(
  frequency: string,
  dayOfWeek: string | null,
  practiceDays: string | null,
  timeOfDay: string | null,
): string {
  const tod = timeOfDay ? TIME_OF_DAY_LABELS_POST[timeOfDay] ?? timeOfDay : null;
  const todStr = tod ? ` ${tod}` : "";
  if (frequency === "daily") return `Come back tomorrow${todStr}`;
  let rawDays: string[] = [];
  try { rawDays = practiceDays ? JSON.parse(practiceDays) as string[] : []; } catch { /* ignore */ }
  if (!rawDays.length && dayOfWeek) rawDays = [dayOfWeek];
  const today = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const checkDow = (today + i) % 7;
    const isMatch = rawDays.some(d => DAY_DOW_LC[d.toLowerCase()] === checkDow);
    if (isMatch) {
      if (i === 1) return `Come back tomorrow${todStr}`;
      const name = Object.keys(DAY_DOW_LC).find(k => DAY_DOW_LC[k] === checkDow);
      return `Come back ${name ? DAY_NAMES_FULL[name] : "next week"}${todStr}`;
    }
  }
  return `Come back next time${todStr}`;
}

type MomentData = {
  moment: {
    id: number;
    name: string;
    intention: string;
    loggingType: LoggingType;
    reflectionPrompt: string | null;
    templateType: string | null;
    intercessionFullText: string | null;
    intercessionTopic: string | null;
    intercessionSource: string | null;
    currentStreak: number;
    longestStreak: number;
    state: string;
    frequency: string;
    dayOfWeek: string | null;
    practiceDays: string | null;
    timeOfDay: string | null;
    contemplativeDurationMinutes?: number | null;
    fastingFrom?: string | null;
    fastingIntention?: string | null;
    fastingFrequency?: string | null;
    fastingDate?: string | null;
    fastingDay?: string | null;
    fastingDayOfMonth?: number | null;
  };
  ritualName: string;
  windowDate: string;
  windowOpen: boolean;
  minutesRemaining: number;
  memberCount: number;
  todayPostCount: number;
  members: MomentMember[];
  myPost: { photoUrl: string | null; reflectionText: string | null; isCheckin: boolean } | null;
  userName: string;
  inviterName: string;
};

// ─── Presence dots ────────────────────────────────────────────────────────────
function PresenceDots({ count, total }: { count: number; total: number }) {
  const shown = Math.min(total, 8);
  return (
    <div className="flex items-center gap-1.5 justify-center">
      {Array.from({ length: shown }).map((_, i) => (
        <motion.div key={i} initial={false} animate={{ scale: i < count ? [1.2, 1] : 1 }}
          className={clsx("w-2.5 h-2.5 rounded-full transition-colors", i < count ? "bg-[#6B8F71]" : "bg-[#c9b99a]/40")} />
      ))}
      {total > 8 && <span className="text-xs text-[#c9b99a]/60">+{total - 8}</span>}
    </div>
  );
}

// ─── Named presence circles (standard) ────────────────────────────────────────
function NamedPresence({ members, myToken }: { members: MomentMember[]; myToken?: string }) {
  const shown = Math.min(members.length, 8);
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {members.slice(0, shown).map((m, i) => {
        const initial = (m.name ?? "?")[0].toUpperCase();
        const isMe = m.userToken === myToken;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.div
              animate={m.prayed ? { scale: [1.1, 1] } : {}}
              className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors",
                m.prayed
                  ? "bg-[#6B8F71] border-[#6B8F71] text-white"
                  : "bg-transparent border-[#6B8F71]/40 text-[#6B8F71]/60"
              )}
            >
              {initial}
            </motion.div>
            <span className="text-[10px] text-[#6b5c4a]/60 max-w-[3rem] text-center leading-tight">
              {isMe ? "you" : (m.name ?? "?").split(" ")[0]}
            </span>
          </div>
        );
      })}
      {members.length > shown && (
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-[#6B8F71]/30 text-[#6B8F71]/50">
            +{members.length - shown}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Named presence circles with bloom animation (intercession) ───────────────
function NamedPresenceWithBloom({ members, myToken, justBloomed }: { members: MomentMember[]; myToken?: string; justBloomed: Set<string> }) {
  const shown = Math.min(members.length, 8);
  return (
    <div className="flex flex-wrap justify-center gap-4">
      {members.slice(0, shown).map((m, i) => {
        const initial = (m.name ?? "?")[0].toUpperCase();
        const isMe = m.userToken === myToken;
        const isBloomin = justBloomed.has(m.userToken);
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <motion.div
              animate={{
                scale: isBloomin ? [0, 1.3, 1] : 1,
                backgroundColor: m.prayed ? "#6B8F71" : "#F7F0E6",
                borderColor: m.prayed ? "#6B8F71" : "rgba(107,143,113,0.4)",
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className={clsx(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2",
                m.prayed ? "text-white" : "text-[#6B8F71]/60"
              )}
            >
              {initial}
            </motion.div>
            <span className="text-[10px] text-[#6b5c4a]/60 max-w-[3rem] text-center leading-tight">
              {isMe ? "you" : (m.name ?? "?").split(" ")[0]}
            </span>
          </div>
        );
      })}
      {members.length > shown && (
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-[#6B8F71]/30 text-[#6B8F71]/50">
            +{members.length - shown}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Intercession prayer page ─────────────────────────────────────────────────
function IntercessionPrayerPage({
  topic, fullText, intention, reflectionPrompt, intercessionSource, memberCount, todayPostCount,
  members, myToken, canPray, alreadyPosted, myReflection, isPraying, postFailed, nextWindowLabel: _nwl, onComplete, onBack,
}: {
  topic: string; fullText: string; intention: string; reflectionPrompt: string;
  intercessionSource: string | null;
  memberCount: number; todayPostCount: number; members: MomentMember[]; myToken?: string;
  canPray: boolean; alreadyPosted: boolean; myReflection: string | null;
  isPraying: boolean; postFailed: boolean; nextWindowLabel: string;
  onComplete: (reflection: string) => void; onBack: () => void;
}) {
  const [reflection, setReflection] = useState(myReflection ?? "");
  const [showReflection, setShowReflection] = useState(false);

  // Confirmation step: "prayer" → "amen-text" → "confirmed"
  // Always start on "prayer" — "confirmed" only appears immediately after tapping Amen
  const [confirmStep, setConfirmStep] = useState<"prayer" | "amen-text" | "confirmed">("prayer");
  const [amenPulse, setAmenPulse] = useState(false);
  const [showGlow, setShowGlow] = useState(false);
  const [justBloomed, setJustBloomed] = useState<Set<string>>(new Set());

  // When alreadyPosted transitions false → true, animate through amen-text → confirmed
  const prevPostedRef = useRef(alreadyPosted);
  useEffect(() => {
    if (!prevPostedRef.current && alreadyPosted && confirmStep === "prayer") {
      setConfirmStep("amen-text");
      const t = setTimeout(() => setConfirmStep("confirmed"), 1500);
      return () => clearTimeout(t);
    }
    prevPostedRef.current = alreadyPosted;
    return undefined;
  }, [alreadyPosted, confirmStep]);

  // Warm glow when a second person prays
  const prevCountRef = useRef(todayPostCount);
  useEffect(() => {
    if (todayPostCount >= 2 && prevCountRef.current < 2) {
      setShowGlow(true);
      const t = setTimeout(() => setShowGlow(false), 2000);
      return () => clearTimeout(t);
    }
    prevCountRef.current = todayPostCount;
    return undefined;
  }, [todayPostCount]);

  // Bloom animation: track newly-prayed members
  const prevPrayedRef = useRef<Set<string>>(
    new Set(members.filter(m => m.prayed).map(m => m.userToken))
  );
  useEffect(() => {
    const newBlooms = members
      .filter(m => m.prayed && !prevPrayedRef.current.has(m.userToken))
      .map(m => m.userToken);
    if (newBlooms.length > 0) {
      setJustBloomed(prev => new Set([...prev, ...newBlooms]));
      newBlooms.forEach(token => {
        setTimeout(() => setJustBloomed(prev => { const s = new Set(prev); s.delete(token); return s; }), 600);
      });
    }
    prevPrayedRef.current = new Set(members.filter(m => m.prayed).map(m => m.userToken));
  }, [members]);

  function handleAmen() {
    setAmenPulse(true);
    onComplete(reflection);
  }

  const headerContainer = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.2, delayChildren: 0.1 } },
  };
  const headerItem = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.4, ease: "easeOut" as const } },
  };

  // ── Confirmation screen (slides up from below) ──────────────────────────────
  const confirmScreen = (
    <motion.div
      key="confirmation"
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="min-h-screen bg-[#F5EDD8] flex items-center justify-center px-6"
    >
      <div className="max-w-xs w-full text-center">
        <div className="text-7xl mb-5">🙏</div>
        <h1 className="text-3xl font-bold text-[#2C1A0E] mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Amen.</h1>
        <p className="text-sm text-[#6b5c4a] mb-6">{todayPostCount} of {memberCount} have prayed together today.</p>
        <div className="mb-8">
          <NamedPresenceWithBloom members={members} myToken={myToken} justBloomed={justBloomed} />
        </div>
        {!myReflection && (
          <div className="mb-6">
            {!showReflection ? (
              <button onClick={() => setShowReflection(true)} className="text-sm text-[#6B8F71] underline-offset-2 hover:underline">
                Add a reflection?
              </button>
            ) : (
              <div className="text-left">
                <p className="font-serif italic text-[#6B8F71] text-sm mb-2">"{reflectionPrompt}"</p>
                <textarea value={reflection} onChange={e => setReflection(e.target.value.slice(0, 280))} rows={3}
                  className="w-full px-4 py-3 rounded-2xl border border-[#c9b99a]/40 focus:border-[#6B8F71] focus:outline-none bg-white resize-none text-sm"
                  placeholder="What is on your heart today?" autoFocus />
                <button onClick={() => onComplete(reflection)} className="mt-2 w-full py-3 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold">
                  Save reflection
                </button>
              </div>
            )}
          </div>
        )}
        {myReflection && (
          <div className="bg-white rounded-2xl border border-[#c9b99a]/30 p-4 mb-6 text-left">
            <p className="text-xs text-[#6b5c4a]/60 italic mb-1">{reflectionPrompt}</p>
            <p className="text-sm font-serif text-[#2C1A0E] italic">"{myReflection}"</p>
          </div>
        )}
        <button onClick={onBack} className="w-full py-4 rounded-2xl bg-[#2C1A0E] text-[#F5EDD8] text-base font-semibold hover:opacity-90 transition-opacity" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          Continue →
        </button>
      </div>
    </motion.div>
  );

  // ── Prayer screen (slides up and out on exit) ───────────────────────────────
  const prayerScreen = (
    <motion.div
      key="prayer"
      exit={{ y: "-100%", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } }}
      className="min-h-screen bg-[#F5EDD8]"
    >
      <div className="max-w-md mx-auto px-5 py-10 pb-24">


        {/* Header — staggered fade-in */}
        <motion.div variants={headerContainer} initial="hidden" animate="visible" className="text-center mb-5">
          <motion.p variants={headerItem} className="text-[11px] uppercase tracking-widest text-[#6B8F71]/60 mb-2">
            {intercessionSource === "bcp" ? "Intercession Prayer" : "Prayer Together"}
          </motion.p>
          <motion.h1 variants={headerItem} className="text-[22px] font-bold text-[#2C1A0E] leading-snug mb-2"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {topic}
          </motion.h1>
          {intention && intention !== topic && (
            <motion.p variants={headerItem} className="text-[#6B8F71] text-[13px]">
              Praying for: {intention}
            </motion.p>
          )}
        </motion.div>

        <div className="w-full h-px bg-[#6B8F71]/20 mb-6" />

        {/* Prayer text — subtle upward settle, 400ms after header */}
        {fullText && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
            className="mb-6"
          >
            <p className="font-serif text-[#2C1A0E] text-base leading-[1.9] whitespace-pre-wrap italic"
              style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
              {fullText}
            </p>
            {intercessionSource === "bcp" && (
              <p className="text-[12px] text-[#6b5c4a]/50 mt-5 italic border-t border-[#c9b99a]/20 pt-3">
                📖 From the Book of Common Prayer
              </p>
            )}
          </motion.div>
        )}

        <div className="w-full h-px bg-[#6B8F71]/20 mb-6" />

        {/* Presence — with ambient glow when two have prayed */}
        <motion.div
          animate={{
            boxShadow: showGlow
              ? "0 0 36px 8px rgba(217,119,6,0.09), 0 0 0 1px rgba(217,119,6,0.05)"
              : "0 0 0 0 rgba(0,0,0,0)",
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-4 text-center rounded-2xl p-3"
        >
          <p className="text-sm text-[#6b5c4a]/70 mb-4">{todayPostCount} of {memberCount} have prayed this 🙏</p>
          <NamedPresenceWithBloom members={members} myToken={myToken} justBloomed={justBloomed} />
        </motion.div>

        <div className="mt-6 mb-3" />

        {/* Amen / state section */}
        {alreadyPosted && confirmStep === "prayer" ? (
          /* Already prayed today — full prayer always readable, no Amen button */
          <div className="text-center py-6">
            <p className="text-[#6B8F71] font-medium text-base mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
              🙏 You prayed this today.
            </p>
            <button onClick={onBack} className="text-sm text-[#6B8F71]/60 hover:text-[#6B8F71] transition-colors">
              ← Back to practice
            </button>
          </div>
        ) : canPray ? (
          confirmStep === "amen-text" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-4"
            >
              <p className="text-4xl font-bold text-[#6B8F71]">🙏 Amen</p>
            </motion.div>
          ) : (
            <>
              <div className="mb-5">
                <p className="font-serif italic text-[#6B8F71] text-sm mb-2 text-center">"{reflectionPrompt}"</p>
                <textarea
                  value={reflection}
                  onChange={e => setReflection(e.target.value.slice(0, 280))}
                  placeholder="What is on your heart today?"
                  rows={3}
                  className="w-full px-4 py-4 rounded-2xl border border-[#c9b99a]/40 focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] outline-none bg-white resize-none text-base leading-relaxed"
                />
                <p className="text-xs text-[#6b5c4a]/40 mt-1.5 italic text-center">optional</p>
              </div>
            </>
          )
        ) : (
          /* Window closed — prayer always readable, back link */
          <div className="text-center py-6">
            <button onClick={onBack} className="text-sm text-[#6B8F71]/70 hover:text-[#6B8F71] transition-colors">
              ← Back to practice
            </button>
          </div>
        )}
      </div>

      {/* Fixed bottom Amen button */}
      {canPray && !alreadyPosted && confirmStep === "prayer" && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#F5EDD8] border-t border-[#c9b99a]/30 px-5 pb-[env(safe-area-inset-bottom)] z-50">
          <div className="max-w-md mx-auto py-4">
            {postFailed && (
              <p className="text-center text-sm text-red-600 mb-2">
                Couldn't save — check your connection and try again.
              </p>
            )}
            <motion.button
              onClick={handleAmen}
              disabled={isPraying}
              animate={amenPulse && !postFailed ? { backgroundColor: ["#2C1A0E", "#B45309", "#2C1A0E"] } : { backgroundColor: "#2C1A0E" }}
              transition={{ duration: 0.3 }}
              className="w-full py-5 rounded-2xl text-[#F5EDD8] text-lg font-bold hover:opacity-90 disabled:opacity-40"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              {isPraying ? "Marking…" : postFailed ? "Try again 🙏" : "Amen 🙏"}
            </motion.button>
            <p className="text-center text-xs text-[#6b5c4a]/40 mt-3 font-serif italic">
              Tapping Amen marks that you have prayed this together.
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );

  return (
    <AnimatePresence mode="wait">
      {confirmStep === "confirmed" ? confirmScreen : prayerScreen}
    </AnimatePresence>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MomentPostPage() {
  const { momentToken, userToken } = useParams<{ momentToken: string; userToken: string }>();
  const [, setLocation] = useLocation();

  const [reflection, setReflection] = useState("");
  const [posted, setPosted] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);

  // Welcome screen — shown once per member per moment (localStorage-gated)
  const welcomeKey = `eleanor-seen-${momentToken}-${userToken}`;
  const [showWelcome, setShowWelcome] = useState(() => {
    try { return !localStorage.getItem(welcomeKey); } catch { return false; }
  });

  function dismissWelcome() {
    try { localStorage.setItem(welcomeKey, "1"); } catch { /* ignore */ }
    setShowWelcome(false);
  }

  const { data, isLoading, error } = useQuery<MomentData>({
    queryKey: [`/api/moment/${momentToken}/${userToken}`],
    queryFn: () => apiRequest("GET", `/api/moment/${momentToken}/${userToken}`),
    retry: false,
    refetchInterval: 15_000,
  });

  const postMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", `/api/moment/${momentToken}/${userToken}/post`, body),
    onSuccess: (res: { todayPostCount: number; memberCount: number }) => {
      setPosted(true);
      setTodayCount(res.todayPostCount);
      setMemberCount(res.memberCount);
      // Redirect back to the practice detail page after showing the success animation
      setTimeout(() => {
        if (data?.moment?.id) {
          setLocation(`/moments/${data.moment.id}`);
        }
      }, 2500);
    },
    onError: () => {
      // Reset amenPulse so the button returns to its normal state for retry
    },
  });

  function handleSubmit(extraReflection?: string) {
    if (!data) return;
    const { loggingType } = data.moment;
    const finalReflection = extraReflection ?? reflection;
    postMutation.mutate({
      reflectionText: (loggingType === "reflection" || loggingType === "both")
        ? finalReflection || undefined
        : undefined,
      isCheckin: loggingType === "checkin" || loggingType === "photo",
    });
  }

  function handleIntercessionComplete(refl: string) {
    postMutation.mutate({
      reflectionText: refl || undefined,
      isCheckin: true,
    });
  }

  const canSubmit = () => {
    if (!data) return false;
    const { loggingType } = data.moment;
    if (loggingType === "reflection") return reflection.trim().length >= 1;
    return true;
  };

  // ── Loading / error states ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F5EDD8] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#6B8F71] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F5EDD8] flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <p className="text-5xl mb-5">🌿</p>
          <p className="font-semibold text-[#2C1A0E] text-lg mb-3">This link doesn't look right.</p>
          <p className="text-sm text-[#6b5c4a] leading-relaxed">
            Your personal link is in your calendar invite —<br />
            look for the Eleanor event and tap the link inside.
          </p>
          <p className="text-sm text-[#6b5c4a] mt-3">
            Or ask the practice organizer to resend your invite.
          </p>
        </div>
      </div>
    );
  }

  // ── Welcome screen — shown once on first visit ──────────────────────────────
  if (showWelcome) {
    const m = data.moment;
    // Build a human-readable schedule label
    const TOD: Record<string, string> = {
      "early-morning": "early morning", morning: "morning", midday: "midday",
      afternoon: "afternoon", "late-afternoon": "late afternoon", evening: "evening", night: "night",
    };
    const DAY_FULL: Record<string, string> = {
      SU: "Sunday", MO: "Monday", TU: "Tuesday", WE: "Wednesday",
      TH: "Thursday", FR: "Friday", SA: "Saturday",
      sunday: "Sunday", monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
      thursday: "Thursday", friday: "Friday", saturday: "Saturday",
    };
    const tod = m.timeOfDay ? (TOD[m.timeOfDay] ?? m.timeOfDay) : "";
    let schedLine = "";
    if (m.frequency === "daily") {
      schedLine = `Every day${tod ? ` · ${tod}` : ""}`;
    } else {
      let days: string[] = [];
      try { if (m.practiceDays) days = JSON.parse(m.practiceDays) as string[]; } catch { /**/ }
      if (!days.length && m.dayOfWeek) days = [m.dayOfWeek];
      const dayStr = days.map(d => DAY_FULL[d] ?? d).join(", ");
      schedLine = dayStr ? `${dayStr}${tod ? ` · ${tod}` : ""}` : `Weekly${tod ? ` · ${tod}` : ""}`;
    }

    // Template-specific badge
    const BADGE: Record<string, string> = {
      "morning-prayer": "🌅 Morning Prayer",
      "evening-prayer": "🌙 Evening Prayer",
      "intercession": "🙏 Intercession Prayer",
      "contemplative": "🕯️ Contemplative Sitting",
      "fasting": "🌿 Fasting Practice",
    };
    const badgeLabel = BADGE[m.templateType ?? ""] ?? "🌿 Practice";
    const isFastingWelcome = m.templateType === "fasting";

    return (
      <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
        {/* Organic background blobs — matches onboarding */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/4 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
        </div>

        {/* Eleanor header */}
        <header className="p-6 flex items-center gap-3 relative z-10">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-lg">🌱</div>
          <span className="font-serif text-lg font-bold text-foreground" style={{ letterSpacing: "-0.025em" }}>Eleanor</span>
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col items-center justify-center px-6 pb-16 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-sm w-full"
          >
            {/* Badge */}
            <div className="flex justify-center mb-6">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/8 text-primary text-sm font-medium border border-primary/15">
                {badgeLabel}
              </span>
            </div>

            {/* Practice name */}
            <h1 className="font-serif text-3xl text-foreground text-center leading-snug mb-2">
              {m.name}
            </h1>

            {/* Invited by */}
            <p className="text-center text-muted-foreground text-sm mb-5">
              {data.inviterName} invited you
            </p>

            {/* Intention */}
            {m.intention && m.intention !== m.name && (
              <div className="border-l-2 border-primary/30 pl-4 mb-5">
                <p className="font-serif italic text-foreground/70 text-base leading-relaxed">
                  "{m.intention}"
                </p>
              </div>
            )}

            {/* Fasting detail */}
            {isFastingWelcome && m.fastingFrom && (
              <div className="bg-[#F0F8F0] border border-primary/20 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                <span className="text-xl">🌿</span>
                <div>
                  <p className="text-xs font-semibold text-primary/70 uppercase tracking-wider mb-0.5">Fasting from</p>
                  <p className="text-sm text-foreground/80">{m.fastingFrom}</p>
                </div>
              </div>
            )}

            {/* Contemplative duration */}
            {m.templateType === "contemplative" && m.contemplativeDurationMinutes && (
              <div className="bg-[#F5F0FF] border border-[#8B7CF6]/20 rounded-xl px-4 py-3 mb-5 flex items-center gap-3">
                <span className="text-xl">🕯️</span>
                <p className="text-sm text-[#5B4B9A]">{m.contemplativeDurationMinutes} minutes of stillness</p>
              </div>
            )}

            {/* Schedule + member count */}
            {!isFastingWelcome && (
              <p className="text-center text-sm text-muted-foreground mb-6">
                {schedLine}{data.memberCount > 1 ? ` · ${data.memberCount} people` : ""}
              </p>
            )}

            {/* Member avatars */}
            {data.members.length > 0 && (
              <div className="flex justify-center gap-3 mb-8">
                {data.members.slice(0, 6).map((mem, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                      {(mem.name ?? "?")[0].toUpperCase()}
                    </div>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[3rem] text-center">
                      {(mem.name ?? "?").split(" ")[0]}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* CTA */}
            <motion.button
              onClick={dismissWelcome}
              whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-2xl bg-foreground text-background text-base font-medium shadow-[var(--shadow-warm-md)] hover:opacity-90 transition-opacity"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              Open practice 🌿
            </motion.button>

            <p className="mt-3 text-center text-xs text-muted-foreground">No account needed.</p>
          </motion.div>
        </main>
      </div>
    );
  }

  const { moment, windowOpen, minutesRemaining, memberCount: mc, todayPostCount, myPost, members = [] } = data;
  const actualMemberCount = memberCount ?? mc;
  const actualTodayCount = todayCount ?? todayPostCount;
  const alreadyPosted = posted || !!myPost;

  // ── Spiritual template logic: open all day on practice days ─────────────────
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(moment.templateType ?? "");
  const isBcp = BCP_TEMPLATE_IDS.has(moment.templateType ?? "");
  const isPracticeDay = (() => {
    if (!isSpiritual) return true;
    if (moment.frequency === "daily") return true;
    const todayDow = new Date().getDay();
    // Try practiceDays JSON array (lowercase day names, e.g. "wednesday")
    if (moment.practiceDays) {
      try {
        const days: string[] = JSON.parse(moment.practiceDays);
        if (days.length > 0) return days.some(d => DAY_DOW_LC[d.toLowerCase()] === todayDow);
      } catch { /* ignore */ }
    }
    // Fallback: dayOfWeek in lowercase ("wednesday") or RRULE ("WE")
    if (moment.dayOfWeek) {
      const lc = moment.dayOfWeek.toLowerCase();
      if (DAY_DOW_LC[lc] !== undefined) return DAY_DOW_LC[lc] === todayDow;
      if (RRULE_DAY_MAP[moment.dayOfWeek] !== undefined) return RRULE_DAY_MAP[moment.dayOfWeek] === todayDow;
    }
    return true;
  })();
  // BCP offices: gated by practice day.
  // Intercession: gated by time-of-day window (server returns accurate windowOpen).
  // Other spiritual practices (contemplative, fasting, custom): always open — nudge, not gate.
  const effectiveWindowOpen = isBcp ? isPracticeDay
    : moment.templateType === "intercession" ? windowOpen
    : isSpiritual ? true
    : windowOpen;

  // BCP only — show "rests today" when it's not a scheduled practice day
  if (isBcp && !isPracticeDay && !alreadyPosted) {
    const isMorning = moment.templateType === "morning-prayer";
    const bgColor = isMorning ? "#2C1810" : "#1A1C2E";
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: bgColor }}>
        <div className="text-center max-w-xs text-[#F7F0E6]">
          <div className="text-5xl mb-5">{isMorning ? "🌅" : "🌙"}</div>
          <h1 className="text-2xl font-bold mb-2">{isMorning ? "Morning Prayer" : "Evening Prayer"}</h1>
          <p className="text-[#F7F0E6]/60 text-sm mb-6">This practice rests today.</p>
          <p className="font-serif italic text-[#F7F0E6]/70 text-sm leading-relaxed">
            {isMorning ? "Come back on your next practice morning." : "Come back on your next practice evening."}
          </p>
        </div>
      </div>
    );
  }

  // ── Intercession — prayer page always accessible; Amen only when window is open ─
  if (moment.templateType === "intercession") {
    const liveMembers: MomentMember[] = members.map(m => ({
      ...m,
      prayed: m.prayed || (posted && m.userToken === userToken),
    }));
    const detailUrl = `/moments/${moment.id}`;
    return (
      <IntercessionPrayerPage
        topic={moment.intercessionTopic ?? moment.name}
        fullText={moment.intercessionFullText ?? ""}
        intention={moment.intention}
        intercessionSource={moment.intercessionSource}
        reflectionPrompt={moment.reflectionPrompt ?? "What is on your heart today?"}
        memberCount={actualMemberCount}
        todayPostCount={actualTodayCount}
        members={liveMembers}
        myToken={userToken}
        canPray={effectiveWindowOpen && !alreadyPosted}
        alreadyPosted={alreadyPosted}
        myReflection={myPost?.reflectionText ?? null}
        isPraying={postMutation.isPending}
        postFailed={postMutation.isError}
        nextWindowLabel={computeNextWindowLabel(moment.frequency, moment.dayOfWeek, moment.practiceDays, moment.timeOfDay)}
        onComplete={handleIntercessionComplete}
        onBack={() => setLocation(detailUrl)}
      />
    );
  }

  // ── Fasting — simple check-in page with reflection ─────────────────────────
  if (moment.templateType === "fasting") {
    const fastingConfirmed = posted || alreadyPosted;
    return (
      <div className="min-h-screen bg-[#F2F7F2] flex flex-col">
        <div className="flex-1 flex flex-col px-6 pt-10 pb-28 max-w-md mx-auto w-full">
          {/* Back */}
          <Link href={`/moments/${moment.id}`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-8 text-sm transition-colors">
            ← Back
          </Link>

          {/* Header */}
          <div className="mb-7">
            <div className="text-4xl mb-3">🌿</div>
            <h1 className="text-2xl font-semibold text-[#2a402c] mb-1">Fasting together</h1>
            {moment.fastingFrom && (
              <p className="text-sm text-[#4a6b50] italic mb-1">From: {moment.fastingFrom}</p>
            )}
            {moment.fastingIntention && (
              <p className="text-sm text-muted-foreground italic">"{moment.fastingIntention}"</p>
            )}
          </div>

          {fastingConfirmed ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-semibold text-[#2a402c] mb-2">Fast logged</h2>
              <p className="text-sm text-muted-foreground mb-6">Your practice today is complete.</p>
              {myPost?.reflectionText && (
                <div className="bg-white/70 border border-[#6B8F71]/25 rounded-2xl px-4 py-3 text-sm text-[#3a5a40] italic w-full text-left">
                  "{myPost.reflectionText}"
                </div>
              )}
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col">
              {/* Scripture of the fast */}
              <div className="bg-white/60 border border-[#6B8F71]/20 rounded-2xl px-5 py-4 mb-6">
                <p className="text-xs font-semibold text-[#4a6b50] uppercase tracking-wider mb-2">A word for fasting</p>
                <p className="text-sm text-[#2a402c] leading-relaxed italic">
                  "Is not this the kind of fasting I have chosen: to loose the chains of injustice and untie the cords of the yoke, to set the oppressed free and break every yoke?"
                </p>
                <p className="text-xs text-muted-foreground mt-2">— Isaiah 58:6</p>
              </div>

              {/* Reflection */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#2a402c] mb-2">
                  {moment.reflectionPrompt ?? "What is arising for you in this fast?"}
                </label>
                <textarea
                  value={reflection}
                  onChange={e => setReflection(e.target.value)}
                  rows={4}
                  placeholder="A thought, a prayer, a word…"
                  className="w-full px-4 py-3 rounded-2xl border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] outline-none bg-white/80 resize-none text-sm leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Fixed bottom button */}
        {!fastingConfirmed && (
          <div className="fixed bottom-0 left-0 right-0 bg-[#F2F7F2] border-t border-[#6B8F71]/20 px-6 pb-[env(safe-area-inset-bottom)] z-50">
            <div className="max-w-md mx-auto py-4">
              {postMutation.isError && (
                <p className="text-center text-sm text-red-600 mb-2">Couldn't save — tap to try again.</p>
              )}
              <button
                onClick={() => postMutation.mutate({ isCheckin: true, reflectionText: reflection.trim() || undefined })}
                disabled={postMutation.isPending}
                className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white font-semibold text-base tracking-wide hover:bg-[#5a7a60] transition-all disabled:opacity-60"
              >
                {postMutation.isPending ? "Logging…" : postMutation.isError ? "Try again ✓" : "✓ I am keeping the fast"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── BCP (Morning Prayer / Evening Prayer) posting page ─────────────────────
  if (isBcp) {
    const isMorning = moment.templateType === "morning-prayer";
    const officeName = isMorning ? "Morning Prayer" : "Evening Prayer";
    const bcpPage = isMorning ? "75" : "115";
    const bcpUrl = isMorning ? "https://bcponline.org/DailyOffice/mp2.html" : "https://bcponline.org/DailyOffice/ep2.html";
    const bgColor = isMorning ? "#2C1810" : "#1A1C2E";
    const accentColor = isMorning ? "#C8975A" : "#7B9EBE";

    // Single unified BCP view — page number and link always visible, bottom state changes after logging
    return (
      <div className="min-h-screen pb-24" style={{ background: bgColor }}>
        <div className="max-w-md mx-auto px-5 pt-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">{isMorning ? "🌅" : "🌙"}</div>
            <h1 className="text-2xl font-bold text-[#F7F0E6]">{officeName}</h1>
            <p className="text-[#F7F0E6]/50 text-sm mt-1 font-serif italic">{moment.intention}</p>
          </div>

          {/* Presence count */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <PresenceDots count={actualTodayCount} total={actualMemberCount} />
            <span className="text-sm text-[#F7F0E6]/60">{actualTodayCount} of {actualMemberCount} prayed today</span>
          </div>

          {/* The BCP link — always visible */}
          <div className="rounded-2xl border border-[#F7F0E6]/20 p-6 mb-5 text-center"
            style={{ background: "rgba(247,240,230,0.07)" }}>
            <p className="text-[#F7F0E6]/50 text-xs uppercase tracking-widest mb-3">Open your Book of Common Prayer</p>
            <p className="text-[#F7F0E6] font-bold text-xl mb-1">📖 Page {bcpPage}</p>
            <p className="text-[#F7F0E6]/60 text-sm mb-4">{officeName} Rite II</p>
            <div className="border-t border-[#F7F0E6]/10 pt-4">
              <p className="text-[#F7F0E6]/50 text-xs mb-2">No BCP? Pray online:</p>
              <button
                onClick={() => window.open(bcpUrl, "_blank", "noopener,noreferrer")}
                className="inline-block px-5 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer"
                style={{ background: accentColor, color: "#2C1810" }}>
                Open {officeName} online →
              </button>
            </div>
          </div>

          {/* Logged state */}
          {alreadyPosted && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="text-center py-6">
              <p className="text-lg font-bold text-[#F7F0E6] mb-1">🌿 You prayed today.</p>
              <p className="text-[#F7F0E6]/50 text-sm">
                {actualTodayCount} of {actualMemberCount} prayed {officeName} today.
              </p>
              <p className="font-serif italic text-[#F7F0E6]/40 text-xs leading-relaxed mt-4">
                {isMorning
                  ? '"Let my prayer be set forth in thy sight as incense." — Psalm 141'
                  : '"O gracious Light, pure brightness of the everliving Father." — Phos Hilaron'}
              </p>
            </motion.div>
          )}
        </div>

        {/* Fixed bottom log button */}
        {!alreadyPosted && !posted && (
          <div className="fixed bottom-0 left-0 right-0 px-5 pb-[env(safe-area-inset-bottom)] z-50" style={{ background: bgColor, borderTop: `1px solid rgba(247,240,230,0.12)` }}>
            <div className="max-w-md mx-auto py-4">
              <button
                onClick={() => postMutation.mutate({ isCheckin: true })}
                disabled={postMutation.isPending}
                className="w-full py-5 rounded-2xl text-[#2C1810] text-lg font-bold transition-all active:scale-95 disabled:opacity-40"
                style={{ background: accentColor }}
              >
                {postMutation.isPending
                  ? "Marking..."
                  : isMorning ? "I prayed Morning Prayer 🌿" : "I prayed Evening Prayer 🌿"
                }
              </button>
              <p className="text-center text-xs text-[#F7F0E6]/30 mt-3 font-serif italic">
                Tap after you pray. Takes 15–20 minutes.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Standard posting layout ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5EDD8]">
      <div className="max-w-md mx-auto px-4 py-8 pb-24">

        {/* Back */}
        <Link
          href={`/moments/${moment.id}`}
          className="text-sm text-[#6b5c4a] hover:text-[#2C1A0E] inline-flex items-center gap-1 mb-6 transition-colors"
        >
          ← Back
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[#2C1A0E]">{moment.name}</h1>
        </div>

        {/* Intention */}
        <div className="bg-white rounded-2xl border border-[#c9b99a]/30 p-6 mb-6 text-center shadow-sm">
          <p className="text-base leading-relaxed text-[#6B8F71] font-serif italic">{moment.intention}</p>
        </div>

        {/* Window / practice day status */}
        {effectiveWindowOpen && !alreadyPosted && (
          <div className="flex items-center justify-between mb-5">
            {isSpiritual ? (
              <span className="text-sm font-medium text-[#6B8F71] bg-[#6B8F71]/10 border border-[#6B8F71]/30 px-3 py-1.5 rounded-full">
                Practice day 🌿
              </span>
            ) : (
              <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
                {minutesRemaining} min remaining
              </span>
            )}
            <div className="flex items-center gap-2">
              <PresenceDots count={actualTodayCount} total={actualMemberCount} />
              <span className="text-xs text-[#6b5c4a]">{actualTodayCount} of {actualMemberCount}</span>
            </div>
          </div>
        )}

        {/* Outside window — not timer */}
        {!effectiveWindowOpen && !alreadyPosted && (
          <OutsideWindowContent moment={moment} minutesRemaining={minutesRemaining} />
        )}

        {/* Already posted — success */}
        {alreadyPosted && !posted && myPost && (
          <div className="bg-white rounded-2xl border border-[#c9b99a]/30 p-5 mb-6 shadow-sm">
            <p className="text-sm font-semibold text-[#2C1A0E] mb-3">🌸 You practiced today.</p>
            {myPost.reflectionText && (
              <div className="bg-[#F5EDD8] rounded-xl p-3">
                {moment.reflectionPrompt && <p className="text-xs text-[#6b5c4a] italic mb-1">{moment.reflectionPrompt}</p>}
                <p className="text-sm text-[#2C1A0E]">{myPost.reflectionText}</p>
              </div>
            )}
            {myPost.isCheckin && !myPost.reflectionText && (
              <p className="text-sm text-[#6b5c4a]">Presence marked. You were here.</p>
            )}
            <p className="text-xs text-[#6b5c4a] mt-3">
              {actualTodayCount} of {actualMemberCount} tended this together.
            </p>
          </div>
        )}

        {/* Success animation */}
        <AnimatePresence>
          {posted && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 0.6 }} className="text-6xl mb-4">🌿</motion.div>
              <p className="text-xl font-semibold text-[#2C1A0E] mb-2">You practiced.</p>
              {(actualTodayCount ?? 0) >= 2 ? (
                <p className="text-sm text-[#6B8F71] font-medium">
                  🌸 {actualTodayCount} of {actualMemberCount} tended this together.
                </p>
              ) : (
                <p className="text-sm text-[#6b5c4a]">
                  {actualTodayCount} of {actualMemberCount} have practiced.
                  <br /><span className="text-xs italic opacity-70 mt-1 block">The practice blooms when two of you practice together.</span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logging section — visible when window/practice day is open and not yet posted */}
        {!alreadyPosted && effectiveWindowOpen && (
          <div className="space-y-4">

            {/* Reflection */}
            {moment.loggingType === "reflection" && (
              <div>
                {moment.reflectionPrompt && (
                  <p className="text-center font-serif italic text-[#6B8F71] text-lg mb-3">
                    "{moment.reflectionPrompt}"
                  </p>
                )}
                <textarea value={reflection} onChange={e => setReflection(e.target.value.slice(0, 280))}
                  placeholder="Take a moment. Then share..."
                  rows={4}
                  className="w-full px-4 py-4 rounded-2xl border border-[#c9b99a]/40 focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] outline-none bg-white resize-none text-base leading-relaxed"
                />
                <p className="text-right text-xs text-[#6b5c4a]/50 mt-1">{reflection.length}/280</p>
              </div>
            )}

            {/* Just show up */}
            {moment.loggingType === "checkin" && (
              <div className="text-center py-6">
                <p className="text-sm text-[#6b5c4a] italic mb-2">{actualTodayCount} of {actualMemberCount} here with you</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom submit button */}
      {!alreadyPosted && effectiveWindowOpen && !posted && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#F5EDD8] border-t border-[#c9b99a]/30 px-4 pb-[env(safe-area-inset-bottom)] z-50">
          <div className="max-w-md mx-auto py-4">
            {postMutation.isError && (
              <p className="text-center text-sm text-red-600 mb-2">Couldn't save — tap to try again.</p>
            )}
            <button onClick={() => handleSubmit()}
              disabled={!canSubmit() || postMutation.isPending}
              className="w-full py-5 rounded-2xl bg-[#2C1A0E] text-[#F5EDD8] text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
              {postMutation.isPending ? "Practicing..." : postMutation.isError ? "Try again 🌿" : "I practiced 🌿"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Outside window content (inline for standard pages) ───────────────────────
function OutsideWindowContent({ moment, minutesRemaining: _ }: { moment: MomentData["moment"]; minutesRemaining: number }) {
  return (
    <div className="text-center py-12">
      <p className="text-4xl mb-4">🌿</p>
      <p className="font-semibold text-[#2C1A0E] text-lg mb-2">This practice is resting.</p>
      <p className="text-sm text-[#6b5c4a]">{moment.name} opens again at the next practice time.</p>
    </div>
  );
}

// ─── Outside window screen (full screen for timer) ────────────────────────────
function OutsideWindowScreen({ moment, minutesRemaining }: { moment: MomentData["moment"]; minutesRemaining: number }) {
  const hrs = Math.floor(minutesRemaining / 60);
  const mins = minutesRemaining % 60;
  const timeAway = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;

  return (
    <div className="min-h-screen bg-[#F5EDD8] flex items-center justify-center px-6">
      <div className="text-center max-w-xs">
        <p className="text-5xl mb-5">🌿</p>
        <p className="font-semibold text-[#2C1A0E] text-xl mb-2">This practice is resting.</p>
        <p className="text-sm text-[#6b5c4a] mb-2">{moment.name} opens at the next practice time.</p>
        {minutesRemaining > 0 && (
          <p className="text-xs text-[#6b5c4a]/70">{timeAway} away</p>
        )}
      </div>
    </div>
  );
}
