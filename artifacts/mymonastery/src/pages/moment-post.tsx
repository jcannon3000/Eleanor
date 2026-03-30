import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import clsx from "clsx";

// ─── Types ────────────────────────────────────────────────────────────────────
type LoggingType = "photo" | "reflection" | "both" | "checkin" | "timer" | "timer_reflection";

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
    timerDurationMinutes: number;
    currentStreak: number;
    longestStreak: number;
    state: string;
  };
  ritualName: string;
  windowDate: string;
  windowOpen: boolean;
  minutesRemaining: number;
  memberCount: number;
  todayPostCount: number;
  myPost: { photoUrl: string | null; reflectionText: string | null; isCheckin: boolean } | null;
  userName: string;
};

type TimerState = "prestart" | "running" | "complete";

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

// ─── SVG Timer Ring ───────────────────────────────────────────────────────────
function TimerRing({ progress, size = 200, strokeWidth = 3 }: { progress: number; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - progress);

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {/* Background ring */}
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(245,237,216,0.2)" strokeWidth={strokeWidth} />
      {/* Progress ring */}
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#6B8F71" strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 1s linear" }} />
    </svg>
  );
}

// ─── Meditation Timer ─────────────────────────────────────────────────────────
function MeditationTimer({
  durationMinutes, intention, intercessionFullText, practiceNamed, memberCount, todayPostCount,
  reflectionPrompt, hasReflection, onComplete,
}: {
  durationMinutes: number;
  intention: string;
  intercessionFullText: string | null;
  practiceNamed: string;
  memberCount: number;
  todayPostCount: number;
  reflectionPrompt: string | null;
  hasReflection: boolean;
  onComplete: (reflection: string) => void;
}) {
  const totalSecs = durationMinutes * 60;
  const [timerState, setTimerState] = useState<TimerState>("prestart");
  const [secondsLeft, setSecondsLeft] = useState(totalSecs);
  const [reflection, setReflection] = useState("");
  const [bcpExpanded, setBcpExpanded] = useState(true);
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(totalSecs);
  const hiddenAt = useRef<number | null>(null);

  const start = useCallback(() => {
    setTimerState("running");
    intervalRef.current = setInterval(() => {
      secondsRef.current -= 1;
      setSecondsLeft(secondsRef.current);
      if (secondsRef.current % 60 === 0 && secondsRef.current > 0) {
        setPulse(true);
        setTimeout(() => setPulse(false), 600);
      }
      if (secondsRef.current <= 0) {
        clearInterval(intervalRef.current!);
        setTimerState("complete");
      }
    }, 1000);
  }, []);

  // Pause/resume on tab hide
  useEffect(() => {
    function onHide() {
      if (timerState === "running") {
        hiddenAt.current = Date.now();
        clearInterval(intervalRef.current!);
      }
    }
    function onShow() {
      if (timerState === "running" && hiddenAt.current) {
        const elapsed = Math.floor((Date.now() - hiddenAt.current) / 1000);
        secondsRef.current = Math.max(0, secondsRef.current - elapsed);
        setSecondsLeft(secondsRef.current);
        hiddenAt.current = null;
        if (secondsRef.current <= 0) {
          setTimerState("complete");
          return;
        }
        intervalRef.current = setInterval(() => {
          secondsRef.current -= 1;
          setSecondsLeft(secondsRef.current);
          if (secondsRef.current <= 0) { clearInterval(intervalRef.current!); setTimerState("complete"); }
        }, 1000);
      }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHide(); else onShow();
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerState]);

  const progress = 1 - secondsLeft / totalSecs;
  const minsDisplay = Math.floor(secondsLeft / 60);
  const secsDisplay = secondsLeft % 60;

  // ── Pre-start screen ────────────────────────────────────────────────────────
  if (timerState === "prestart") {
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-[#F5EDD8] text-center mb-2">{practiceNamed}</h1>
          <p className="text-center text-[#a08060] italic font-serif text-base leading-relaxed mb-6 max-w-xs mx-auto">
            {intention}
          </p>

          {/* BCP prayer */}
          {intercessionFullText && (
            <div className="bg-[#F5EDD8] rounded-2xl p-4 mb-6">
              <button onClick={() => setBcpExpanded(e => !e)}
                className="w-full flex items-center justify-between text-xs font-semibold text-[#4a3728] mb-2">
                <span>The prayer</span>
                <span>{bcpExpanded ? "▲" : "▼"}</span>
              </button>
              {bcpExpanded && (
                <p className="text-sm text-[#4a3728] font-serif italic leading-relaxed">{intercessionFullText}</p>
              )}
              {bcpExpanded && (
                <p className="text-xs text-[#4a3728]/60 mt-2">From the Book of Common Prayer</p>
              )}
            </div>
          )}

          {/* Ring preview */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <TimerRing progress={0} size={180} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl font-bold text-[#F5EDD8] font-mono">
                  {durationMinutes}:00
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <PresenceDots count={todayPostCount} total={memberCount} />
              <span className="text-xs text-[#c9b99a]/70">{todayPostCount} of {memberCount} sitting with you</span>
            </div>
          </div>

          <button onClick={start}
            className="w-full py-4 bg-[#6B8F71] text-[#F5EDD8] rounded-2xl text-lg font-semibold hover:bg-[#5a7a60] transition-colors">
            Begin 🌿
          </button>
        </div>
      </div>
    );
  }

  // ── Running screen ──────────────────────────────────────────────────────────
  if (timerState === "running") {
    return (
      <div className="min-h-screen bg-[#2C1A0E] flex flex-col items-center justify-center">
        <motion.div animate={pulse ? { scale: [1, 1.02, 1] } : {}} transition={{ duration: 0.6 }}
          className="flex flex-col items-center">
          <div className="relative">
            <TimerRing progress={progress} size={220} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-[#c9b99a]/50 font-mono">
                {String(minsDisplay).padStart(2, "0")}:{String(secsDisplay).padStart(2, "0")}
              </span>
            </div>
          </div>
          <p className="mt-6 text-xs text-[#c9b99a]/50">{todayPostCount} of {memberCount} sitting with you</p>
        </motion.div>
      </div>
    );
  }

  // ── Complete screen ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#2C1A0E] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center mb-8">
          <div className="relative mx-auto w-32 h-32 mb-4">
            <TimerRing progress={1} size={128} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">🌿</span>
            </div>
          </div>
          <p className="text-2xl font-semibold text-[#F5EDD8] mb-2">
            {durationMinutes} minutes of stillness, together.
          </p>
          <p className="text-sm text-[#c9b99a]/70">{todayPostCount} of {memberCount} sat with you.</p>
        </motion.div>

        {hasReflection && reflectionPrompt && (
          <div className="mb-6">
            <p className="text-center font-serif italic text-[#a08060] text-lg mb-3">
              "{reflectionPrompt}"
            </p>
            <textarea value={reflection} onChange={e => setReflection(e.target.value.slice(0, 280))}
              placeholder="Take a moment. Then share..."
              rows={4}
              className="w-full px-4 py-4 rounded-2xl border border-[#c9b99a]/20 bg-[#3d2510] text-[#F5EDD8] placeholder:text-[#c9b99a]/40 resize-none focus:outline-none focus:border-[#6B8F71]"
            />
          </div>
        )}

        <button onClick={() => onComplete(reflection)}
          className="w-full py-4 bg-[#6B8F71] text-[#F5EDD8] rounded-2xl text-lg font-semibold hover:bg-[#5a7a60] transition-colors">
          I showed up 🌿
        </button>
        <p className="text-center text-xs text-[#c9b99a]/40 mt-3 italic">Reflection is always optional</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MomentPostPage() {
  const { momentToken, userToken } = useParams<{ momentToken: string; userToken: string }>();

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [reflection, setReflection] = useState("");
  const [posted, setPosted] = useState(false);
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, error } = useQuery<MomentData>({
    queryKey: [`/api/moment/${momentToken}/${userToken}`],
    queryFn: () => apiRequest("GET", `/api/moment/${momentToken}/${userToken}`),
    retry: false,
    refetchInterval: 30_000,
  });

  const postMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", `/api/moment/${momentToken}/${userToken}/post`, body),
    onSuccess: (res: { todayPostCount: number; memberCount: number }) => {
      setPosted(true);
      setTodayCount(res.todayPostCount);
      setMemberCount(res.memberCount);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(extraReflection?: string) {
    if (!data) return;
    const { loggingType } = data.moment;
    const finalReflection = extraReflection ?? reflection;
    postMutation.mutate({
      photoUrl: (loggingType === "photo" || loggingType === "both") ? photoPreview ?? undefined : undefined,
      reflectionText: (loggingType === "reflection" || loggingType === "both" || loggingType === "timer_reflection")
        ? finalReflection || undefined
        : undefined,
      isCheckin: loggingType === "checkin" || loggingType === "timer" || loggingType === "timer_reflection",
    });
  }

  const canSubmit = () => {
    if (!data) return false;
    const { loggingType } = data.moment;
    if (loggingType === "photo") return !!photoPreview;
    if (loggingType === "reflection") return reflection.trim().length >= 1;
    if (loggingType === "both") return !!photoPreview && reflection.trim().length >= 1;
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

  const { moment, windowOpen, minutesRemaining, memberCount: mc, todayPostCount, myPost } = data;
  const actualMemberCount = memberCount ?? mc;
  const actualTodayCount = todayCount ?? todayPostCount;
  const alreadyPosted = posted || !!myPost;

  // ── Timer pages — full screen, separate from main layout ───────────────────
  if ((moment.loggingType === "timer" || moment.loggingType === "timer_reflection") && windowOpen && !alreadyPosted) {
    return (
      <MeditationTimer
        durationMinutes={moment.timerDurationMinutes}
        intention={moment.intention}
        intercessionFullText={moment.intercessionFullText}
        practiceNamed={moment.name}
        memberCount={actualMemberCount}
        todayPostCount={actualTodayCount}
        reflectionPrompt={moment.reflectionPrompt}
        hasReflection={moment.loggingType === "timer_reflection"}
        onComplete={(refl) => handleSubmit(refl)}
      />
    );
  }

  // ── Outside window or already posted for timer ──────────────────────────────
  if ((moment.loggingType === "timer" || moment.loggingType === "timer_reflection") && !alreadyPosted && !windowOpen) {
    return <OutsideWindowScreen moment={moment} minutesRemaining={minutesRemaining} />;
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

        {/* Window status */}
        {windowOpen && !alreadyPosted && (
          <div className="flex items-center justify-between mb-5">
            <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
              {minutesRemaining} min remaining
            </span>
            <div className="flex items-center gap-2">
              <PresenceDots count={actualTodayCount} total={actualMemberCount} />
              <span className="text-xs text-[#6b5c4a]">{actualTodayCount} of {actualMemberCount}</span>
            </div>
          </div>
        )}

        {/* Outside window — not timer */}
        {!windowOpen && !alreadyPosted && (
          <OutsideWindowContent moment={moment} minutesRemaining={minutesRemaining} />
        )}

        {/* Already posted — success */}
        {alreadyPosted && !posted && myPost && (
          <div className="bg-white rounded-2xl border border-[#c9b99a]/30 p-5 mb-6 shadow-sm">
            <p className="text-sm font-semibold text-[#2C1A0E] mb-3">🌸 You showed up today.</p>
            {myPost.photoUrl && (
              <img src={myPost.photoUrl} alt="Your moment" className="w-full rounded-xl mb-3 object-cover max-h-64" />
            )}
            {myPost.reflectionText && (
              <div className="bg-[#F5EDD8] rounded-xl p-3">
                {moment.reflectionPrompt && <p className="text-xs text-[#6b5c4a] italic mb-1">{moment.reflectionPrompt}</p>}
                <p className="text-sm text-[#2C1A0E]">{myPost.reflectionText}</p>
              </div>
            )}
            {myPost.isCheckin && !myPost.photoUrl && !myPost.reflectionText && (
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
                  {actualTodayCount} of {actualMemberCount} have shown up.
                  <br /><span className="text-xs italic opacity-70 mt-1 block">The practice blooms when two of you show up together.</span>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logging section — visible when window is open and not yet posted */}
        {!alreadyPosted && windowOpen && (
          <div className="space-y-4">

            {/* Photo */}
            {(moment.loggingType === "photo" || moment.loggingType === "both") && (
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
                  onChange={handleFileChange} className="hidden" />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-full rounded-2xl object-cover max-h-72" />
                    <button onClick={() => { setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white text-sm">×</button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-[#c9b99a]/60 hover:border-[#6B8F71]/50 rounded-2xl p-10 text-center transition-colors">
                    <p className="text-3xl mb-2">📷</p>
                    <p className="font-medium text-[#2C1A0E]">Share your moment</p>
                  </button>
                )}
              </div>
            )}

            {/* Reflection */}
            {(moment.loggingType === "reflection" || moment.loggingType === "both") && (
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
      <p className="text-sm text-[#6b5c4a]">{moment.name} opens again at the next window.</p>
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
        <p className="text-sm text-[#6b5c4a] mb-2">{moment.name} opens at the next window.</p>
        {minutesRemaining > 0 && (
          <p className="text-xs text-[#6b5c4a]/70">{timeAway} away</p>
        )}
      </div>
    </div>
  );
}
