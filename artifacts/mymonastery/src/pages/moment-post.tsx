import { useState, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import clsx from "clsx";

type MomentData = {
  moment: {
    id: number;
    name: string;
    intention: string;
    loggingType: "photo" | "reflection" | "both" | "checkin";
    reflectionPrompt: string | null;
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
  myPost: {
    photoUrl: string | null;
    reflectionText: string | null;
    isCheckin: boolean;
  } | null;
  userName: string;
};

function PresenceDots({ count, total }: { count: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          initial={false}
          animate={{ scale: i < count ? [1.2, 1] : 1 }}
          className={clsx(
            "w-2.5 h-2.5 rounded-full transition-colors",
            i < count ? "bg-primary" : "bg-border"
          )}
        />
      ))}
    </div>
  );
}

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
  });

  const postMutation = useMutation({
    mutationFn: (body: object) =>
      apiRequest("POST", `/api/moment/${momentToken}/${userToken}/post`, body),
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

  function handleSubmit() {
    if (!data) return;
    const { loggingType } = data.moment;
    postMutation.mutate({
      photoUrl: (loggingType === "photo" || loggingType === "both") ? photoPreview ?? undefined : undefined,
      reflectionText: (loggingType === "reflection" || loggingType === "both") ? reflection : undefined,
      isCheckin: loggingType === "checkin",
    });
  }

  const canSubmit = () => {
    if (!data) return false;
    const { loggingType } = data.moment;
    if (loggingType === "photo") return !!photoPreview;
    if (loggingType === "reflection") return reflection.trim().length >= 1;
    if (loggingType === "both") return !!photoPreview && reflection.trim().length >= 1;
    if (loggingType === "checkin") return true;
    return false;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[var(--color-cream)] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">🌿</p>
          <p className="font-semibold text-foreground mb-2">This link isn't valid</p>
          <p className="text-sm text-muted-foreground">Your personal link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  const { moment, ritualName, windowOpen, minutesRemaining, memberCount: mc, todayPostCount, myPost, userName } = data;
  const actualMemberCount = memberCount ?? mc;
  const actualTodayCount = todayCount ?? todayPostCount;
  const alreadyPosted = posted || !!myPost;

  // Presence text
  let presenceText = "";
  if (alreadyPosted) {
    if (actualTodayCount >= 2) {
      presenceText = `🌸 ${actualTodayCount} of ${actualMemberCount} showed up — this window counts`;
    } else {
      presenceText = `You're the first one here 🌿 — the streak blooms when two of you show up`;
    }
  } else if (todayPostCount >= 1) {
    presenceText = `🌿 ${todayPostCount} of ${actualMemberCount} already here — show up and make it count`;
  }

  return (
    <div className="min-h-screen bg-[var(--color-cream)]">
      <div className="max-w-md mx-auto px-4 py-8 pb-24">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">{ritualName}</p>
          <h1 className="text-2xl font-semibold text-foreground">🌿 {moment.name}</h1>
        </div>

        {/* Intention — always the first thing */}
        <div className="bg-white rounded-2xl border border-border p-6 mb-6 text-center shadow-sm">
          <p className="text-base leading-relaxed text-[var(--color-sage)] font-medium italic">
            {moment.intention}
          </p>
        </div>

        {/* Window status */}
        {windowOpen && (
          <div className="flex items-center justify-between mb-6">
            <span className="text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full">
              {minutesRemaining} min remaining
            </span>
            <div className="flex items-center gap-3">
              <PresenceDots count={actualTodayCount} total={actualMemberCount} />
              <span className="text-xs text-muted-foreground">
                {actualTodayCount} of {actualMemberCount}
              </span>
            </div>
          </div>
        )}

        {!windowOpen && !alreadyPosted && (
          <div className="bg-card rounded-2xl border border-border p-4 mb-6 text-center">
            <p className="text-sm text-muted-foreground">The window for today has closed.</p>
          </div>
        )}

        {/* Presence text */}
        {presenceText && (
          <p className="text-center text-sm text-muted-foreground italic mb-6">{presenceText}</p>
        )}

        {/* Already posted — show their post */}
        {alreadyPosted && !posted && myPost && (
          <div className="bg-card rounded-2xl border border-border p-5 mb-6">
            <p className="text-sm font-semibold text-foreground mb-3">You showed up today ✓</p>
            {myPost.photoUrl && (
              <img src={myPost.photoUrl} alt="Your moment" className="w-full rounded-xl mb-3 object-cover max-h-64" />
            )}
            {myPost.reflectionText && (
              <div className="bg-secondary/50 rounded-xl p-3">
                {moment.reflectionPrompt && (
                  <p className="text-xs text-muted-foreground italic mb-1">{moment.reflectionPrompt}</p>
                )}
                <p className="text-sm text-foreground">{myPost.reflectionText}</p>
              </div>
            )}
            {myPost.isCheckin && !myPost.photoUrl && !myPost.reflectionText && (
              <p className="text-sm text-muted-foreground">Presence marked. You were here.</p>
            )}
          </div>
        )}

        {/* Success state */}
        <AnimatePresence>
          {posted && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <motion.div
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="text-6xl mb-4"
              >
                🌿
              </motion.div>
              <p className="text-xl font-semibold text-foreground mb-2">You showed up.</p>
              {(todayCount ?? 0) >= 2 ? (
                <p className="text-sm text-primary font-medium">
                  🌸 {todayCount} of {actualMemberCount} circle members have shown up — this window counts
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {todayCount} of {actualMemberCount} circle members have shown up today.
                </p>
              )}
              {(todayCount ?? 0) < 2 && (
                <p className="text-xs text-muted-foreground/70 mt-2 italic">
                  The streak blooms when two of you show up together 🌿
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logging section */}
        {!alreadyPosted && windowOpen && (
          <div className="space-y-4">
            {/* Photo upload */}
            {(moment.loggingType === "photo" || moment.loggingType === "both") && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {photoPreview ? (
                  <div className="relative">
                    <img src={photoPreview} alt="Preview" className="w-full rounded-2xl object-cover max-h-72" />
                    <button
                      onClick={() => { setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                      className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white text-sm hover:bg-black/80 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border hover:border-primary/50 rounded-2xl p-10 text-center transition-colors"
                  >
                    <p className="text-3xl mb-2">📷</p>
                    <p className="font-medium text-foreground">Share your moment</p>
                    <p className="text-sm text-muted-foreground mt-1">Tap to open camera or photo library</p>
                  </button>
                )}
              </div>
            )}

            {/* Reflection input */}
            {(moment.loggingType === "reflection" || moment.loggingType === "both") && (
              <div>
                {moment.reflectionPrompt && (
                  <p className="text-center font-serif italic text-[var(--color-sage)] text-lg mb-3">
                    "{moment.reflectionPrompt}"
                  </p>
                )}
                <textarea
                  value={reflection}
                  onChange={e => setReflection(e.target.value.slice(0, 280))}
                  placeholder="Take a moment. Then share..."
                  rows={4}
                  className="w-full px-4 py-4 rounded-2xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-white resize-none text-base leading-relaxed"
                />
                <p className="text-right text-xs text-muted-foreground mt-1">{reflection.length}/280</p>
              </div>
            )}

            {/* Check-in only */}
            {moment.loggingType === "checkin" && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">No photo or words needed.</p>
                <p className="text-sm text-muted-foreground">Just tap to mark your presence.</p>
              </div>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit() || postMutation.isPending}
              className="w-full py-4 rounded-2xl bg-[var(--color-soil)] text-[var(--color-cream)] text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {postMutation.isPending ? "Showing up..." : "I showed up 🌿"}
            </button>
          </div>
        )}

        {/* Streak info */}
        {moment.currentStreak > 0 && (
          <div className="mt-8 text-center">
            <p className="text-xs text-muted-foreground">
              🔥 {moment.currentStreak} window streak · {moment.longestStreak} longest
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
