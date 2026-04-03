import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft } from "lucide-react";
import clsx from "clsx";

type LoggingType = "reflection" | "checkin";
type Frequency = "daily" | "weekly" | "monthly";

const INTENTION_PLACEHOLDERS = [
  "Share your morning coffee together ☕",
  "Five minutes of stillness before the day starts 🌿",
  "Breathe together. Pray together. Show up together.",
  "A moment of gratitude, wherever you are 🌸",
  "Walk outside and notice something beautiful 🚶",
];

const REFLECTION_EXAMPLES = [
  "How was your experience today?",
  "What are you grateful for in this moment?",
  "What did you notice in your five minutes?",
  "What came up for you?",
  "Where are you right now?",
];

const LOGGING_OPTIONS: {
  type: LoggingType;
  icon: string;
  label: string;
  description: string;
  bestFor: string;
}[] = [
  {
    type: "reflection",
    icon: "✍️",
    label: "Reflection",
    description: "A short written response to a prompt you set.",
    bestFor: "Prayer, meditation, gratitude, walks",
  },
  {
    type: "checkin",
    icon: "✅",
    label: "Just practice",
    description: "No words needed. Just mark that you were here.",
    bestFor: "Meditation, prayer, breathing practices",
  },
];

const STEP_COUNT = 5;

export default function MomentPlant() {
  const { id: ritualId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [intention, setIntention] = useState("");
  const [intentionPlaceholderIdx, setIntentionPlaceholderIdx] = useState(0);
  const [loggingType, setLoggingType] = useState<LoggingType>("reflection");
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [reflectionExampleIdx, setReflectionExampleIdx] = useState(0);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [goalDays, setGoalDays] = useState(30);
  const [commitmentSessionsGoal, setCommitmentSessionsGoal] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setIntentionPlaceholderIdx(i => (i + 1) % INTENTION_PLACEHOLDERS.length);
      setReflectionExampleIdx(i => (i + 1) % REFLECTION_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const plantMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest("POST", `/api/rituals/${ritualId}/moments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}/moments`] });
      setStep(STEP_COUNT); // success step
    },
  });

  const { data: ritual } = useQuery<{ name: string }>({
    queryKey: [`/api/rituals/${ritualId}`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}`),
  });

  const canNext = () => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return intention.trim().length >= 1;
    if (step === 2) {
      if (loggingType === "reflection") {
        return reflectionPrompt.trim().length >= 1;
      }
      return true;
    }
    if (step === 3) return scheduledTime.length === 5;
    if (step === 4) return commitmentSessionsGoal !== null;
    return true;
  };

  function handleSubmit() {
    plantMutation.mutate({
      name: name.trim(),
      intention: intention.trim(),
      loggingType,
      reflectionPrompt: loggingType === "reflection" ? reflectionPrompt.trim() : undefined,
      frequency,
      scheduledTime,
      goalDays,
      commitmentSessionsGoal,
    });
  }

  const stepVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  if (step === STEP_COUNT) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 pt-8 pb-24 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          >
            <div className="text-6xl mb-6">🌿</div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">Your moment is planted</h1>
            <p className="text-muted-foreground mb-2">
              <span className="font-medium text-foreground">{name}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-8">
              Eleanor will send calendar invites to your tradition. When the window opens, each member taps their personal link and shows up.
            </p>
            <button
              onClick={() => setLocation(`/ritual/${ritualId}`)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
            >
              Back to tradition
            </button>
          </motion.div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : setLocation(`/ritual/${ritualId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest mb-1">
              {ritual?.name ?? "Your tradition"}
            </p>
            <h1 className="text-lg font-semibold text-foreground">Plant a Shared Moment</h1>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-8">
          {Array.from({ length: STEP_COUNT }).map((_, i) => (
            <div
              key={i}
              className={clsx(
                "h-1 rounded-full transition-all duration-300",
                i < step ? "bg-primary flex-1" : i === step ? "bg-primary/60 w-8" : "bg-border w-4"
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Name */}
          {step === 0 && (
            <motion.div key="step-name" variants={stepVariants} initial="initial" animate="animate" exit="exit">
              <h2 className="text-xl font-semibold text-foreground mb-2">What is this moment called?</h2>
              <p className="text-sm text-muted-foreground mb-6">Give your ritual a name your tradition will recognize.</p>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Morning coffee together..."
                maxLength={100}
                autoFocus
                className="w-full px-4 py-4 text-lg rounded-2xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background transition-all"
              />
              <p className="text-xs text-muted-foreground mt-2 text-right">{name.length}/100</p>
            </motion.div>
          )}

          {/* Step 1: Intention */}
          {step === 1 && (
            <motion.div key="step-intention" variants={stepVariants} initial="initial" animate="animate" exit="exit">
              <h2 className="text-xl font-semibold text-foreground mb-2">What is this moment about? 🌿</h2>
              <p className="text-sm text-muted-foreground mb-6">
                This will appear for your tradition when the window opens. It sets the intention.
              </p>
              <textarea
                value={intention}
                onChange={e => setIntention(e.target.value.slice(0, 140))}
                placeholder={INTENTION_PLACEHOLDERS[intentionPlaceholderIdx]}
                rows={4}
                className="w-full px-4 py-4 text-base rounded-2xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-[var(--color-cream)] resize-none transition-all leading-relaxed"
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-muted-foreground italic">Keep it short — this is a prompt, not an essay.</p>
                <p className={clsx("text-xs font-medium", intention.length >= 130 ? "text-amber-600" : "text-muted-foreground")}>
                  {intention.length}/140
                </p>
              </div>
            </motion.div>
          )}

          {/* Step 2: Logging type */}
          {step === 2 && (
            <motion.div key="step-logging" variants={stepVariants} initial="initial" animate="animate" exit="exit">
              <h2 className="text-xl font-semibold text-foreground mb-2">How will your tradition practice? 📷</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Choose how members log their moment. Everyone uses the same format.
              </p>
              <div className="space-y-3">
                {LOGGING_OPTIONS.map(opt => (
                  <button
                    key={opt.type}
                    onClick={() => setLoggingType(opt.type)}
                    className={clsx(
                      "w-full text-left p-4 rounded-2xl border-2 transition-all",
                      loggingType === opt.type
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5">{opt.icon}</span>
                      <div>
                        <p className="font-semibold text-foreground">{opt.label}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{opt.description}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Best for: {opt.bestFor}</p>
                      </div>
                      <div className={clsx(
                        "ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                        loggingType === opt.type ? "border-primary bg-primary" : "border-border"
                      )}>
                        {loggingType === opt.type && <CheckCircle2 size={12} className="text-primary-foreground" strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Reflection prompt input */}
              {loggingType === "reflection" && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-6"
                >
                  <label className="block text-sm font-semibold text-foreground mb-1">
                    What's your prompt?
                  </label>
                  <input
                    type="text"
                    value={reflectionPrompt}
                    onChange={e => setReflectionPrompt(e.target.value.slice(0, 100))}
                    placeholder={REFLECTION_EXAMPLES[reflectionExampleIdx]}
                    maxLength={100}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background transition-all"
                  />
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground italic">For inspiration:</p>
                    <div className="flex flex-wrap gap-2">
                      {[REFLECTION_EXAMPLES[(reflectionExampleIdx + 1) % REFLECTION_EXAMPLES.length],
                        REFLECTION_EXAMPLES[(reflectionExampleIdx + 2) % REFLECTION_EXAMPLES.length],
                        REFLECTION_EXAMPLES[(reflectionExampleIdx + 3) % REFLECTION_EXAMPLES.length]].map((ex, i) => (
                        <button
                          key={i}
                          onClick={() => setReflectionPrompt(ex)}
                          className="text-xs px-3 py-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors italic"
                        >
                          "{ex}"
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Step 3: Time */}
          {step === 3 && (
            <motion.div key="step-time" variants={stepVariants} initial="initial" animate="animate" exit="exit">
              <h2 className="text-xl font-semibold text-foreground mb-2">When does your tradition gather? 🗓️</h2>
              <p className="text-sm text-muted-foreground mb-6">
                A one-hour window opens at this time. Members practice and log whenever they can.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Time of day</label>
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background text-lg"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">How often</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["daily", "weekly", "monthly"] as Frequency[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setFrequency(f)}
                        className={clsx(
                          "py-3 rounded-xl border-2 text-sm font-medium capitalize transition-all",
                          frequency === f
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                        )}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 4: Goal (progressive) */}
          {step === 4 && (() => {
            type GoalOpt = { sessions: number; emoji: string; label: string; sub: string };
            const goalOptions: GoalOpt[] =
              frequency === "daily" ? [
                { sessions: 7,  emoji: "🌱", label: "7 days",      sub: "One week · A first tender step" },
                { sessions: 14, emoji: "🌿", label: "14 days",     sub: "Two weeks · Finding your rhythm" },
              ] : [
                { sessions: 4,  emoji: "🌱", label: "4 sessions",  sub: "One month · A first tender step" },
                { sessions: 8,  emoji: "🌿", label: "8 sessions",  sub: "Two months · Finding your rhythm" },
              ];

            return (
              <motion.div key="step-goal" variants={stepVariants} initial="initial" animate="animate" exit="exit">
                <h2 className="text-xl font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  What's your first goal? 🌱
                </h2>
                <p className="text-sm text-muted-foreground italic mb-6">
                  Start small. Eleanor will nudge you higher when you get there.
                </p>

                <div className="space-y-2.5 mb-4">
                  {goalOptions.map(opt => {
                    const sel = commitmentSessionsGoal === opt.sessions;
                    return (
                      <button
                        key={opt.sessions}
                        onClick={() => setCommitmentSessionsGoal(opt.sessions)}
                        className="relative w-full text-left rounded-2xl overflow-hidden transition-all duration-200"
                        style={{
                          background: sel ? "#6B8F71" : "#EEF3EF",
                          border: `1.5px solid ${sel ? "#6B8F71" : "#c8dac9"}`,
                          boxShadow: sel ? "0 4px 14px rgba(107,143,113,0.22)" : undefined,
                        }}
                      >
                        {sel && (
                          <span className="absolute top-3 right-3 text-[#F5EDD8] font-bold text-base">✓</span>
                        )}
                        <div className="flex items-center gap-4 px-5 py-4">
                          <span className="text-3xl leading-none shrink-0">{opt.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-[15px] leading-snug ${sel ? "text-[#F5EDD8]" : "text-[#2C1A0E]"}`}
                              style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                              {opt.label}
                            </p>
                            <p className={`text-xs mt-0.5 ${sel ? "text-[#F5EDD8]/75" : "text-muted-foreground"}`}>
                              {opt.sub}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-center text-muted-foreground/50 italic mb-5">
                  Longer goals unlock when you get there. 🌿
                </p>

                {commitmentSessionsGoal && (
                  <p className="text-sm text-center text-[#6B8F71] italic" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    {commitmentSessionsGoal} sessions together. A good place to begin. 🌱
                  </p>
                )}

                <div className="bg-card border border-border rounded-2xl p-4 mt-5">
                  <p className="text-sm font-medium text-foreground mb-1">Your moment summary</p>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>🌿 <span className="text-foreground font-medium">{name}</span></p>
                    <p className="italic pl-4 text-xs leading-relaxed">{intention}</p>
                    <p>
                      {LOGGING_OPTIONS.find(o => o.type === loggingType)?.icon}{" "}
                      {LOGGING_OPTIONS.find(o => o.type === loggingType)?.label}
                      {reflectionPrompt && ` · "${reflectionPrompt}"`}
                    </p>
                    <p>🗓️ {frequency.charAt(0).toUpperCase() + frequency.slice(1)} at {scheduledTime}{commitmentSessionsGoal ? ` · ${commitmentSessionsGoal} sessions` : ""}</p>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        {/* Navigation */}
        <div className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur border-t border-border px-4 py-4">
          <div className="max-w-lg mx-auto flex gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}
            {step < STEP_COUNT - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canNext() || plantMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {plantMutation.isPending ? "Planting..." : "Plant this moment 🌿"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
