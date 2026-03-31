import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
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
    currentStreak: number;
    longestStreak: number;
    state: string;
    frequency: string;
    dayOfWeek: string | null;
    practiceDays: string | null;
    timeOfDay: string | null;
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

// ─── Named presence circles ───────────────────────────────────────────────────
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

// ─── Intercession prayer page ─────────────────────────────────────────────────
function IntercessionPrayerPage({
  topic, fullText, intention, reflectionPrompt, memberCount, todayPostCount,
  members, myToken, canPray, alreadyPosted, myReflection, isPraying, nextWindowLabel, onComplete, onBack,
}: {
  topic: string;
  fullText: string;
  intention: string;
  reflectionPrompt: string;
  memberCount: number;
  todayPostCount: number;
  members: MomentMember[];
  myToken?: string;
  canPray: boolean;
  alreadyPosted: boolean;
  myReflection: string | null;
  isPraying: boolean;
  nextWindowLabel: string;
  onComplete: (reflection: string) => void;
  onBack: () => void;
}) {
  const [reflection, setReflection] = useState(myReflection ?? "");
  const [showReflection, setShowReflection] = useState(false);

  // Post-Amen confirmation screen
  if (alreadyPosted) {
    return (
      <div className="min-h-screen bg-[#F5EDD8] flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="max-w-xs w-full text-center">
          <div className="text-7xl mb-5">🙏</div>
          <h1 className="text-3xl font-bold text-[#2C1A0E] mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Amen.
          </h1>
          <p className="text-sm text-[#6b5c4a] mb-6">
            {todayPostCount} of {memberCount} have prayed together today.
          </p>

          {/* Named presence */}
          <div className="mb-8">
            <NamedPresence members={members} myToken={myToken} />
          </div>

          {/* Optional reflection */}
          {!myReflection && (
            <div className="mb-6">
              {!showReflection ? (
                <button
                  onClick={() => setShowReflection(true)}
                  className="text-sm text-[#6B8F71] underline-offset-2 hover:underline"
                >
                  Add a reflection?
                </button>
              ) : (
                <div className="text-left">
                  <p className="font-serif italic text-[#6B8F71] text-sm mb-2">"{reflectionPrompt}"</p>
                  <textarea
                    value={reflection}
                    onChange={e => setReflection(e.target.value.slice(0, 280))}
                    rows={3}
                    className="w-full px-4 py-3 rounded-2xl border border-[#c9b99a]/40 focus:border-[#6B8F71] focus:outline-none bg-white resize-none text-sm"
                    placeholder="What are you holding today?"
                    autoFocus
                  />
                  <button
                    onClick={() => onComplete(reflection)}
                    className="mt-2 w-full py-3 rounded-xl bg-[#6B8F71] text-white text-sm font-semibold"
                  >
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

          {/* Continue button — goes back to detail */}
          <button
            onClick={onBack}
            className="w-full py-4 rounded-2xl bg-[#2C1A0E] text-[#F5EDD8] text-base font-semibold hover:opacity-90 transition-opacity"
            style={{ fontFamily: "Space Grotesk, sans-serif" }}
          >
            Continue →
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5EDD8]">
      <div className="max-w-md mx-auto px-5 py-10 pb-24">

        {/* Back link — shown when window is closed (read-only) */}
        {!canPray && (
          <button onClick={onBack} className="text-xs text-[#6b5c4a]/60 hover:text-[#6b5c4a] flex items-center gap-1 mb-6 transition-colors">
            ← Back
          </button>
        )}

        {/* Header */}
        <p className="text-[11px] uppercase tracking-widest text-[#6b5c4a]/50 text-center mb-2">
          {canPray ? "Today's intercession" : "Intercession prayer"}
        </p>
        <h1 className="text-[22px] font-bold text-[#2C1A0E] text-center leading-snug mb-2"
          style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          {topic}
        </h1>

        {/* Intention */}
        {intention && (
          <p className="text-center text-[#6B8F71] text-[13px] mb-5">
            Praying for: {intention}
          </p>
        )}

        {/* Thin divider */}
        <div className="w-full h-px bg-[#6B8F71]/20 mb-6" />

        {/* Full prayer card — Playfair Display italic */}
        {fullText && (
          <div className="mb-6">
            <p className="font-serif text-[#2C1A0E] text-base leading-[1.9] whitespace-pre-wrap italic"
              style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
              {fullText}
            </p>
            <p className="text-[12px] text-[#6b5c4a]/50 mt-5 italic border-t border-[#c9b99a]/20 pt-3">
              From the Book of Common Prayer
            </p>
          </div>
        )}

        {/* Thin divider */}
        <div className="w-full h-px bg-[#6B8F71]/20 mb-6" />

        {/* Live presence — named circles */}
        <div className="mb-2 text-center">
          <p className="text-sm text-[#6b5c4a]/70 mb-4">
            {todayPostCount} of {memberCount} have prayed this 🙏
          </p>
          <NamedPresence members={members} myToken={myToken} />
        </div>

        <div className="mt-6 mb-3" />

        {canPray ? (
          <>
            {/* Reflection (optional, before Amen) */}
            <div className="mb-5">
              <p className="font-serif italic text-[#6B8F71] text-sm mb-2 text-center">
                "{reflectionPrompt}"
              </p>
              <textarea
                value={reflection}
                onChange={e => setReflection(e.target.value.slice(0, 280))}
                placeholder="Who or what are you holding today?"
                rows={3}
                className="w-full px-4 py-4 rounded-2xl border border-[#c9b99a]/40 focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] outline-none bg-white resize-none text-base leading-relaxed"
              />
              <p className="text-xs text-[#6b5c4a]/40 mt-1.5 italic text-center">optional</p>
            </div>

            {/* Amen button */}
            <button
              onClick={() => onComplete(reflection)}
              disabled={isPraying}
              className="w-full py-5 rounded-2xl bg-[#2C1A0E] text-[#F5EDD8] text-lg font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
              style={{ fontFamily: "Space Grotesk, sans-serif" }}
            >
              {isPraying ? "Marking…" : "Amen 🙏"}
            </button>
            <p className="text-center text-xs text-[#6b5c4a]/40 mt-3 font-serif italic">
              Tapping Amen marks that you have prayed this together.
            </p>
          </>
        ) : (
          /* Window not open — preview only, show next window time */
          <div className="text-center py-4">
            <p className="text-sm text-[#6b5c4a]/60 font-serif italic">{nextWindowLabel}</p>
          </div>
        )}
      </div>
    </div>
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
    if (moment.frequency === "weekly" && moment.dayOfWeek) {
      const todayDow = new Date().getDay();
      return RRULE_DAY_MAP[moment.dayOfWeek] === todayDow;
    }
    return true;
  })();
  const effectiveWindowOpen = isSpiritual ? isPracticeDay : windowOpen;

  // ── Spiritual practice — rests today (not a practice day) ──────────────────
  if (isSpiritual && !isPracticeDay && !alreadyPosted) {
    return (
      <div className="min-h-screen bg-[#F5EDD8] flex items-center justify-center px-6">
        <div className="text-center max-w-xs">
          <p className="text-5xl mb-5">🌿</p>
          <p className="text-xl font-semibold text-[#2C1A0E] mb-3">This practice rests today.</p>
          <p className="text-sm text-[#6b5c4a] italic">{moment.name}</p>
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
        reflectionPrompt={moment.reflectionPrompt ?? "What are you holding today?"}
        memberCount={actualMemberCount}
        todayPostCount={actualTodayCount}
        members={liveMembers}
        myToken={userToken}
        canPray={effectiveWindowOpen && !alreadyPosted}
        alreadyPosted={alreadyPosted}
        myReflection={myPost?.reflectionText ?? null}
        isPraying={postMutation.isPending}
        nextWindowLabel={computeNextWindowLabel(moment.frequency, moment.dayOfWeek, moment.practiceDays, moment.timeOfDay)}
        onComplete={handleIntercessionComplete}
        onBack={() => setLocation(detailUrl)}
      />
    );
  }

  // ── BCP (Morning Prayer / Evening Prayer) posting page ─────────────────────
  if (isBcp) {
    const isMorning = moment.templateType === "morning-prayer";
    const officeName = isMorning ? "Morning Prayer" : "Evening Prayer";
    const bcpPage = isMorning ? "75" : "115";
    const bcpUrl = isMorning ? "https://bcponline.org/MP2.html" : "https://bcponline.org/EP2.html";
    const bgColor = isMorning ? "#2C1810" : "#1A1C2E";
    const accentColor = isMorning ? "#C8975A" : "#7B9EBE";

    if (!effectiveWindowOpen && !alreadyPosted) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: bgColor }}>
          <div className="text-center max-w-xs text-[#F7F0E6]">
            <div className="text-5xl mb-5">{isMorning ? "🌅" : "🌙"}</div>
            <h1 className="text-2xl font-bold mb-2">{officeName}</h1>
            <p className="text-[#F7F0E6]/60 text-sm mb-6">This practice rests today.</p>
            <p className="font-serif italic text-[#F7F0E6]/70 text-sm leading-relaxed">
              {isMorning ? "Come back on your next practice morning." : "Come back on your next practice evening."}
            </p>
          </div>
        </div>
      );
    }

    if (alreadyPosted) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ background: bgColor }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-sm text-[#F7F0E6]">
            <div className="text-6xl mb-5">{isMorning ? "🌅" : "🌙"}</div>
            <h1 className="text-2xl font-bold mb-2">You prayed today.</h1>
            <p className="text-[#F7F0E6]/60 text-sm mb-6">
              {actualTodayCount} of {actualMemberCount} prayed {officeName} today.
            </p>
            <p className="font-serif italic text-[#F7F0E6]/50 text-sm leading-relaxed">
              {isMorning
                ? '"Let my prayer be set forth in thy sight as incense." — Psalm 141'
                : '"O gracious Light, pure brightness of the everliving Father." — Phos Hilaron'}
            </p>
          </motion.div>
        </div>
      );
    }

    // Main BCP posting view — open and not yet prayed
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

          {/* The BCP link — MOST PROMINENT ELEMENT */}
          <div className="rounded-2xl border border-[#F7F0E6]/20 p-6 mb-5 text-center"
            style={{ background: "rgba(247,240,230,0.07)" }}>
            <p className="text-[#F7F0E6]/50 text-xs uppercase tracking-widest mb-3">Open your Book of Common Prayer</p>
            <p className="text-[#F7F0E6] font-bold text-xl mb-1">📖 Page {bcpPage}</p>
            <p className="text-[#F7F0E6]/60 text-sm mb-4">{officeName} Rite II</p>
            <div className="border-t border-[#F7F0E6]/10 pt-4">
              <p className="text-[#F7F0E6]/50 text-xs mb-2">No BCP? Pray online:</p>
              <a href={bcpUrl} target="_blank" rel="noopener noreferrer"
                className="inline-block px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
                style={{ background: accentColor, color: "#2C1810" }}>
                Open {officeName} online →
              </a>
            </div>
          </div>

          {/* Already posted by others */}
          {actualTodayCount > 0 && (
            <p className="text-center text-sm text-[#F7F0E6]/50 mb-5 font-serif italic">
              {actualTodayCount === 1 ? "1 person prayed with you already." : `${actualTodayCount} people have prayed today.`}
            </p>
          )}

          {/* Submit */}
          <AnimatePresence>
            {posted ? (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8">
                <div className="text-5xl mb-4">🌿</div>
                <p className="text-xl font-bold text-[#F7F0E6]">You prayed.</p>
                <p className="text-[#F7F0E6]/60 text-sm mt-2">
                  {actualTodayCount} of {actualMemberCount} prayed today.
                </p>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  // ── Standard posting layout ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F5EDD8]">
      <div className="max-w-md mx-auto px-4 py-8 pb-24">

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
            <p className="text-sm font-semibold text-[#2C1A0E] mb-3">🌸 You showed up today.</p>
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
              <p className="text-xl font-semibold text-[#2C1A0E] mb-2">You showed up.</p>
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

            {/* Submit */}
            <button onClick={() => handleSubmit()}
              disabled={!canSubmit() || postMutation.isPending}
              className="w-full py-5 rounded-2xl bg-[#2C1A0E] text-[#F5EDD8] text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
              {postMutation.isPending ? "Showing up..." : "I showed up 🌿"}
            </button>
          </div>
        )}
      </div>
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
