import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

type LoggingType = "photo" | "reflection" | "both" | "checkin";
type Frequency = "daily" | "weekly" | "monthly";

interface ContactSuggestion { name: string; email: string; }

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

const LOGGING_OPTIONS: { type: LoggingType; icon: string; label: string; description: string; bestFor: string; }[] = [
  { type: "photo", icon: "📷", label: "Photo", description: "A photo of the moment — coffee cup, morning light, wherever you are.", bestFor: "Coffee rituals, walks, meals, anything visual" },
  { type: "reflection", icon: "✍️", label: "Reflection", description: "A short written response to a prompt you set.", bestFor: "Prayer, meditation, gratitude" },
  { type: "both", icon: "📷✍️", label: "Photo + Reflection", description: "A photo and a short reflection — presence and meaning together.", bestFor: "When you want the image and the words" },
  { type: "checkin", icon: "✅", label: "Just show up", description: "No photo, no words. Just mark that you were here.", bestFor: "Meditation, prayer, breathing practices" },
];

const STEP_LABELS = ["Name", "People", "Intention", "Format", "Schedule", "Goal"];
const STEP_COUNT = 6;

function useContactSearch(query: string) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        setSuggestions(res.ok ? await res.json() : []);
      } catch { setSuggestions([]); }
      finally { setIsLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { suggestions, isLoading, clearSuggestions: () => setSuggestions([]) };
}

function PersonRow({
  person, index, showRemove, onUpdate, onRemove, onSelect,
}: {
  person: { name: string; email: string }; index: number; showRemove: boolean;
  onUpdate: (i: number, f: "name" | "email", v: string) => void;
  onRemove: (i: number) => void;
  onSelect: (i: number, c: ContactSuggestion) => void;
}) {
  const [activeField, setActiveField] = useState<"name" | "email" | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchQuery = activeField === "name" ? person.name : activeField === "email" ? person.email : "";
  const { suggestions, isLoading, clearSuggestions } = useContactSearch(justSelected ? "" : searchQuery);

  const handleSelect = useCallback((contact: ContactSuggestion) => {
    setJustSelected(true); setActiveField(null); clearSuggestions();
    onSelect(index, contact);
    setTimeout(() => setJustSelected(false), 500);
  }, [index, onSelect, clearSuggestions]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveField(null); clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearSuggestions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text" value={person.name}
            onChange={e => { setJustSelected(false); onUpdate(index, "name", e.target.value); }}
            onFocus={() => setActiveField("name")}
            placeholder="Name" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        <div className="relative flex-[1.5]">
          <input
            type="email" value={person.email}
            onChange={e => { setJustSelected(false); onUpdate(index, "email", e.target.value); }}
            onFocus={() => setActiveField("email")}
            placeholder="Email" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        {showRemove && (
          <button onClick={() => onRemove(index)} className="text-muted-foreground hover:text-destructive transition-colors text-lg px-1">×</button>
        )}
      </div>
      {(suggestions.length > 0 || isLoading) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">Searching...</div>}
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0">
              <span className="font-medium text-sm">{s.name}</span>
              <span className="text-muted-foreground text-xs ml-2">{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MomentNew() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState([{ name: "", email: "" }]);
  const [intention, setIntention] = useState("");
  const [intentionPlaceholderIdx, setIntentionPlaceholderIdx] = useState(0);
  const [loggingType, setLoggingType] = useState<LoggingType>("photo");
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [reflectionExampleIdx, setReflectionExampleIdx] = useState(0);
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [scheduledHour, setScheduledHour] = useState(8);
  const [scheduledMinute, setScheduledMinute] = useState(0);
  const [scheduledAmPm, setScheduledAmPm] = useState<"AM" | "PM">("AM");
  const [dayOfWeek, setDayOfWeek] = useState<string>("");
  const [goalDays, setGoalDays] = useState(30);

  const scheduledTime = (() => {
    let h = scheduledHour % 12;
    if (scheduledAmPm === "PM") h += 12;
    if (h === 12 && scheduledAmPm === "AM") h = 0;
    return `${String(h).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`;
  })();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIntentionPlaceholderIdx(i => (i + 1) % INTENTION_PLACEHOLDERS.length);
      setReflectionExampleIdx(i => (i + 1) % REFLECTION_EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const plantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number } }>("POST", "/api/moments", data),
    onSuccess: (data) => setLocation(`/moments/${data.moment.id}`),
  });

  const addPerson = () => {
    if (participants.length >= 19) return;
    setParticipants(p => [...p, { name: "", email: "" }]);
  };
  const removePerson = (i: number) => setParticipants(p => p.filter((_, idx) => idx !== i));
  const updatePerson = (i: number, field: "name" | "email", value: string) => {
    setParticipants(p => { const n = [...p]; n[i][field] = value; return n; });
  };
  const selectContact = (i: number, contact: ContactSuggestion) => {
    setParticipants(p => { const n = [...p]; n[i] = { name: contact.name, email: contact.email }; return n; });
  };

  const canNext = () => {
    if (step === 0) return name.trim().length >= 2;
    if (step === 1) return participants.some(p => p.name.trim() && p.email.trim());
    if (step === 2) return intention.trim().length >= 4;
    if (step === 3) {
      if (loggingType === "reflection" || loggingType === "both") return reflectionPrompt.trim().length >= 1;
      return true;
    }
    if (step === 4) {
      if (frequency === "weekly" && !dayOfWeek) return false;
      return scheduledTime.length === 5;
    }
    if (step === 5) return goalDays >= 1;
    return true;
  };

  function handleSubmit() {
    const validParticipants = participants.filter(p => p.name.trim() && p.email.trim());
    plantMutation.mutate({
      name: name.trim(),
      intention: intention.trim(),
      loggingType,
      reflectionPrompt: (loggingType === "reflection" || loggingType === "both") ? reflectionPrompt.trim() : undefined,
      frequency,
      scheduledTime,
      dayOfWeek: frequency === "weekly" && dayOfWeek ? dayOfWeek : undefined,
      goalDays,
      participants: validParticipants,
    });
  }

  const stepVariants = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  };

  if (authLoading) return null;

  if (step === STEP_COUNT) {
    const freqLabel = frequency === "daily" ? "every day" : frequency === "weekly" ? "every week" : "every month";
    const [h, m] = scheduledTime.split(":").map(Number);
    const timeLabel = new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const validParticipants = participants.filter(p => p.name.trim() && p.email.trim());
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 pb-16">
          <div className="bg-card rounded-[2rem] p-10 shadow-[var(--shadow-warm-lg)] border border-card-border text-center">
            <div className="text-5xl mb-4">🌿</div>
            <h2 className="text-3xl font-semibold text-foreground mb-3">{name} is planted.</h2>
            <p className="text-muted-foreground mb-6">
              {freqLabel} at {timeLabel}, everyone in your moment gets one hour to show up.<br />
              Eleanor put it on your Google Calendar — each person's link is in the description.
            </p>
            <div className="bg-secondary/40 rounded-2xl p-5 text-left mb-8">
              <p className="text-sm font-medium text-foreground mb-3">Who's in it ({validParticipants.length + 1} people):</p>
              <ul className="space-y-1">
                <li className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{user?.name}</span> (you) — link in your calendar
                </li>
                {validParticipants.map((p, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{p.name}</span> — {p.email}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-muted-foreground italic mb-6">
              "The rituals you tend now become the traditions you'll remember."
            </p>
            <button
              onClick={() => setLocation("/dashboard")}
              className="px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-colors"
            >
              Back to Garden
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-8 pb-16">
        <div className="mb-10">
          <button
            onClick={() => step === 0 ? setLocation("/create") : setStep(s => s - 1)}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-8 transition-colors"
          >
            ← {step === 0 ? "Back" : "Previous step"}
          </button>
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Plant a Shared Moment</p>
            <p className="text-sm text-muted-foreground">Step {step + 1} of {STEP_COUNT} — {STEP_LABELS[step]}</p>
          </div>
          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            />
          </div>
        </div>

        <div className="bg-card rounded-[2rem] p-8 md:p-12 shadow-[var(--shadow-warm-lg)] border border-card-border min-h-[420px] flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              variants={stepVariants}
              initial="initial" animate="animate" exit="exit"
              transition={{ duration: 0.25 }}
              className="flex-1 flex flex-col"
            >

              {/* Step 0 — Name */}
              {step === 0 && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What do you want to call this moment?</h2>
                    <p className="text-muted-foreground">A short, clear name for the ritual you're planting.</p>
                  </div>
                  <input
                    autoFocus type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && canNext() && setStep(1)}
                    placeholder="Morning coffee, Evening walk, Sunday prayers..."
                    className="w-full text-xl md:text-2xl px-0 py-4 bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  />
                  <p className="text-sm text-muted-foreground/60 italic">
                    This is what people will see when they open their link.
                  </p>
                </div>
              )}

              {/* Step 1 — People */}
              {step === 1 && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">Who's joining you?</h2>
                    <p className="text-muted-foreground">
                      Add anyone — family, friends, long-distance or local. Each person gets their own link. No account needed to participate.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {participants.map((p, i) => (
                      <PersonRow
                        key={i} person={p} index={i}
                        showRemove={participants.length > 1}
                        onUpdate={updatePerson}
                        onRemove={removePerson}
                        onSelect={selectContact}
                      />
                    ))}
                  </div>
                  {participants.length < 19 && (
                    <button
                      onClick={addPerson}
                      className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                    >
                      + Add another person
                    </button>
                  )}
                </div>
              )}

              {/* Step 2 — Intention */}
              {step === 2 && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What's the intention?</h2>
                    <p className="text-muted-foreground">This is the first thing everyone reads when they open their link. Make it feel like an invitation.</p>
                  </div>
                  <div className="relative">
                    <textarea
                      autoFocus value={intention}
                      onChange={e => setIntention(e.target.value)}
                      maxLength={280}
                      rows={3}
                      placeholder={INTENTION_PLACEHOLDERS[intentionPlaceholderIdx]}
                      className="w-full px-0 py-3 bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors resize-none text-lg placeholder:text-muted-foreground/40"
                    />
                    <span className="absolute bottom-4 right-0 text-xs text-muted-foreground/50">{intention.length}/280</span>
                  </div>
                </div>
              )}

              {/* Step 3 — Logging type */}
              {step === 3 && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">How do people show up?</h2>
                    <p className="text-muted-foreground">What does participating look like?</p>
                  </div>
                  <div className="grid gap-3">
                    {LOGGING_OPTIONS.map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => setLoggingType(opt.type)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${loggingType === opt.type ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div>
                            <p className="font-medium text-foreground">{opt.label}</p>
                            <p className="text-sm text-muted-foreground">{opt.description}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {(loggingType === "reflection" || loggingType === "both") && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2">
                      <label className="block text-sm font-medium text-foreground mb-2">Your reflection prompt</label>
                      <input
                        autoFocus type="text" value={reflectionPrompt}
                        onChange={e => setReflectionPrompt(e.target.value)}
                        placeholder={REFLECTION_EXAMPLES[reflectionExampleIdx]}
                        className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* Step 4 — Schedule */}
              {step === 4 && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">When does the window open?</h2>
                    <p className="text-muted-foreground">Everyone has one hour to post after this time.</p>
                  </div>
                  <div className="space-y-5">
                    {/* Frequency */}
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">How often</label>
                      <div className="flex gap-3">
                        {(["daily", "weekly", "monthly"] as Frequency[]).map(f => (
                          <button key={f} onClick={() => { setFrequency(f); if (f !== "weekly") setDayOfWeek(""); }}
                            className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm capitalize transition-all ${frequency === f ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-foreground"}`}>
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Day of week — only when weekly */}
                    {frequency === "weekly" && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        <label className="block text-sm font-medium text-muted-foreground mb-2">Which day</label>
                        <div className="grid grid-cols-7 gap-1.5">
                          {[
                            { label: "Mo", value: "MO" }, { label: "Tu", value: "TU" },
                            { label: "We", value: "WE" }, { label: "Th", value: "TH" },
                            { label: "Fr", value: "FR" }, { label: "Sa", value: "SA" },
                            { label: "Su", value: "SU" },
                          ].map(d => (
                            <button key={d.value} onClick={() => setDayOfWeek(d.value)}
                              className={`py-3 rounded-xl border-2 font-medium text-sm transition-all ${dayOfWeek === d.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/20 text-foreground"}`}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {/* Styled time picker */}
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-2">What time</label>
                      <div className="space-y-3">
                        {/* Hour row */}
                        <div>
                          <p className="text-xs text-muted-foreground/70 mb-1.5">Hour</p>
                          <div className="grid grid-cols-6 gap-1.5">
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                              <button key={h} onClick={() => setScheduledHour(h)}
                                className={`py-2 rounded-lg border text-sm font-medium transition-all ${scheduledHour === h ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/20 text-foreground"}`}>
                                {h}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* Minute row */}
                        <div>
                          <p className="text-xs text-muted-foreground/70 mb-1.5">Minute</p>
                          <div className="flex gap-2">
                            {[0, 15, 30, 45].map(m => (
                              <button key={m} onClick={() => setScheduledMinute(m)}
                                className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${scheduledMinute === m ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/20 text-foreground"}`}>
                                :{String(m).padStart(2, "0")}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* AM/PM */}
                        <div className="flex gap-2">
                          {(["AM", "PM"] as const).map(ap => (
                            <button key={ap} onClick={() => setScheduledAmPm(ap)}
                              className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${scheduledAmPm === ap ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/20 text-foreground"}`}>
                              {ap}
                            </button>
                          ))}
                        </div>
                        {/* Time preview */}
                        <p className="text-center text-base font-medium text-foreground/70">
                          Window opens at <span className="text-primary font-semibold">
                            {scheduledHour}:{String(scheduledMinute).padStart(2, "0")} {scheduledAmPm}
                          </span>
                          {frequency === "weekly" && dayOfWeek && (
                            <> every <span className="text-primary font-semibold">
                              {{"MO":"Monday","TU":"Tuesday","WE":"Wednesday","TH":"Thursday","FR":"Friday","SA":"Saturday","SU":"Sunday"}[dayOfWeek]}
                            </span></>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 5 — Goal */}
              {step === 5 && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">Set a goal</h2>
                    <p className="text-muted-foreground">How many days do you want to tend this moment?</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[7, 14, 21, 30, 60, 100].map(days => (
                      <button
                        key={days}
                        onClick={() => setGoalDays(days)}
                        className={`py-4 rounded-xl border-2 font-medium transition-all ${goalDays === days ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30 text-foreground"}`}
                      >
                        {days} days
                      </button>
                    ))}
                  </div>
                  <div className="bg-secondary/40 rounded-2xl p-5 space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Summary</p>
                    <p>🌿 <span className="text-foreground">{name}</span></p>
                    <p>👥 {participants.filter(p => p.email.trim()).length + 1} people (including you)</p>
                    <p>⏰ {frequency === "daily" ? "Every day" : frequency === "weekly" && dayOfWeek ? `Every ${{"MO":"Monday","TU":"Tuesday","WE":"Wednesday","TH":"Thursday","FR":"Friday","SA":"Saturday","SU":"Sunday"}[dayOfWeek]}` : "Every month"} at {scheduledHour}:{String(scheduledMinute).padStart(2,"0")} {scheduledAmPm}</p>
                    <p>✨ {LOGGING_OPTIONS.find(o => o.type === loggingType)?.label}</p>
                    <p>🎯 {goalDays}-day goal</p>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          <div className="mt-10 flex justify-between items-center pt-6 border-t border-border/50">
            <div />
            {step < STEP_COUNT - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!canNext()}
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canNext() || plantMutation.isPending}
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:shadow-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.25)]"
              >
                {plantMutation.isPending ? (
                  <><span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Planting...</>
                ) : <>Plant it 🌿</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
