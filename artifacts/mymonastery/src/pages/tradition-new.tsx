import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";

/* ─── constants ─────────────────────────────────────────────────────────────── */

const STEP_LABELS = ["Type", "Name", "Who", "Rhythm", "Goal", "When"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

const TYPE_OPTIONS = [
  { value: "coffee", emoji: "\u2615", label: "Coffee", tagline: "Share your first cup, again and again" },
  { value: "meal", emoji: "\uD83C\uDF7D\uFE0F", label: "A Meal", tagline: "The table is the oldest gathering place" },
  { value: "walk", emoji: "\uD83D\uDEB6", label: "A Walk", tagline: "Move together on a regular day" },
  { value: "run", emoji: "\uD83C\uDFC3", label: "A Run", tagline: "Keep the pace, keep the commitment" },
  { value: "custom", emoji: "\uD83C\uDF31", label: "Something else", tagline: "Name your own tradition" },
];

const RHYTHM_OPTIONS = [
  { value: "weekly", label: "Every week", tagline: "A weekly rhythm" },
  { value: "biweekly", label: "Every two weeks", tagline: "A fortnightly ritual" },
  { value: "monthly", label: "Once a month", tagline: "A monthly anchor" },
];

const GOAL_OPTIONS = [
  { months: 1, emoji: "\uD83C\uDF31", label: "One month", phase: "Taking root" },
  { months: 3, emoji: "\uD83C\uDF3F", label: "Three months", phase: "Growing" },
  { months: 6, emoji: "\uD83C\uDF38", label: "Six months", phase: "In bloom" },
  { months: 0, emoji: "\uD83C\uDF3E", label: "Ongoing", phase: "" },
];

const GATHERINGS_PER_MONTH: Record<string, number> = { weekly: 4, biweekly: 2, monthly: 1 };

const FREQ_LABEL: Record<string, string> = {
  weekly: "every week",
  biweekly: "every two weeks",
  monthly: "once a month",
};

const PLANT_FRAMES = ["\uD83C\uDF31", "\uD83C\uDF3F", "\uD83C\uDF3F", "\uD83C\uDF3E", "\uD83C\uDF3F", "\uD83C\uDF31"];

/* ─── small components ──────────────────────────────────────────────────────── */

function ProgressBar({ step, goBack }: { step: number; goBack: () => void }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#6B8F71] font-medium">
          Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
        </span>
        {step > 1 && (
          <button onClick={goBack} className="text-xs text-[#2C1810]/50 hover:text-[#2C1810]">
            ← Back
          </button>
        )}
      </div>
      <div className="w-full h-1 bg-[#e8d5b8] rounded-full">
        <div
          className="h-full bg-[#C17F24] rounded-full transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </div>
    </div>
  );
}

function ContinueButton({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end mt-8">
      <button
        onClick={onClick}
        disabled={disabled}
        className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors disabled:opacity-40"
      >
        Continue →
      </button>
    </div>
  );
}

function PlantingScreen({ name, firstNames }: { name: string; firstNames: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % PLANT_FRAMES.length), 600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="min-h-screen bg-[#2C1810] flex flex-col items-center justify-center px-6">
      <div className="text-7xl mb-6" key={frame}>{PLANT_FRAMES[frame]}</div>
      <h1 className="font-serif text-2xl text-[#F7F0E6] text-center mb-2">
        Planting {name || "your tradition"}…
      </h1>
      {firstNames && (
        <p className="text-[#F7F0E6]/50 text-sm text-center">Sending invites to {firstNames}</p>
      )}
    </div>
  );
}

/* ─── main ──────────────────────────────────────────────────────────────────── */

export default function TraditionNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [type, setType] = useState("custom");
  const [name, setName] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<{ name: string; email: string }[]>([]);
  const [newPeople, setNewPeople] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [frequency, setFrequency] = useState("");
  const [goalMonths, setGoalMonths] = useState<number | null>(null);
  const [firstPick, setFirstPick] = useState("");
  const [alt1, setAlt1] = useState("");
  const [alt2, setAlt2] = useState("");
  const [sending, setSending] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  const goBack = () => setStep((s) => Math.max(1, s - 1));
  const goNext = () => setStep((s) => s + 1);

  /* focus name input */
  useEffect(() => {
    if (step === 2) nameRef.current?.focus();
  }, [step]);

  /* connections for "Who" step */
  const { data: connectionsData } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: () => apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections"),
    enabled: step === 3,
  });
  const connections = connectionsData?.connections ?? [];

  /* helpers */
  function gatheringsFor(months: number) {
    const n = (GATHERINGS_PER_MONTH[frequency] ?? 4) * months;
    return months === 1 ? `${n} gathering${n === 1 ? "" : "s"}` : `~${n} gatherings`;
  }

  const firstNames = selectedPeople
    .map((p) => (p.name ? p.name.split(" ")[0] : p.email))
    .join(", ");

  const hasAtLeastOnePerson =
    selectedPeople.length > 0 || newPeople.some((p) => p.email.trim() !== "");

  /* toggle existing person */
  function togglePerson(person: { name: string; email: string }) {
    setSelectedPeople((prev) =>
      prev.some((p) => p.email === person.email)
        ? prev.filter((p) => p.email !== person.email)
        : [...prev, person]
    );
  }

  /* merge new people on continue */
  function continueWho() {
    const validNew = newPeople.filter((p) => p.email.trim());
    const merged = [...selectedPeople];
    for (const np of validNew) {
      if (!merged.some((p) => p.email === np.email)) merged.push(np);
    }
    setSelectedPeople(merged);
    goNext();
  }

  /* ─── send invites (step 7 auto-fires this) ──────────────────────────────── */

  async function send() {
    if (!user || !firstPick) return;
    setSending(true);
    try {
      const ritual = await apiRequest<{ id: number }>("POST", "/api/rituals", {
        name,
        frequency,
        participants: selectedPeople,
        intention: `A ${type} tradition. Together.`,
        ownerId: user.id,
        dayPreference: "",
      });

      const times = [
        new Date(firstPick).toISOString(),
        ...(alt1 ? [new Date(alt1).toISOString()] : []),
        ...(alt2 ? [new Date(alt2).toISOString()] : []),
      ];

      await apiRequest("PATCH", `/api/rituals/${ritual.id}/proposed-times`, {
        proposedTimes: times,
      });

      qc.invalidateQueries({ queryKey: ["/api/rituals"] });
      setLocation("/dashboard");
    } catch (err) {
      console.error("Failed to create tradition", err);
      setSending(false);
    }
  }

  // auto-fire on step 7
  useEffect(() => {
    if (step === 7 && !sending && firstPick) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  /* ─── planting screen ─────────────────────────────────────────────────────── */

  if (step === 7) {
    return <PlantingScreen name={name} firstNames={firstNames} />;
  }

  /* ─── render ──────────────────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#FAF6F0] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <ProgressBar step={step} goBack={goBack} />

        <div className="bg-white rounded-3xl shadow-sm border border-[#C17F24]/15 p-6 md:p-8">

          {/* ── 1  Type ── */}
          {step === 1 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">What will you tend together?</h1>
              <p className="text-[#2C1810]/50 text-sm italic mb-6">Recurring gatherings are where belonging forms.</p>
              <div className="flex flex-col gap-3">
                {TYPE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => { setType(o.value); setName(""); goNext(); }}
                    className="w-full text-left p-4 rounded-2xl border border-[#e8d5b8] hover:border-[#C17F24]/50 hover:bg-[#C17F24]/5 transition-all flex items-center gap-4"
                  >
                    <span className="text-2xl">{o.emoji}</span>
                    <div>
                      <div className="font-medium text-[#2C1810]">{o.label}</div>
                      <div className="text-sm text-[#2C1810]/50">{o.tagline}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 2  Name ── */}
          {step === 2 && (
            <div>
              <p className="text-xs text-[#C17F24] font-medium tracking-widest uppercase mb-3">Start a Tradition</p>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">What do you want to call it?</h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">Give your tradition a simple, clear name.</p>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Coffee"
                className="w-full text-2xl font-serif bg-transparent border-b-2 border-[#C17F24]/40 focus:border-[#C17F24] outline-none py-3 text-[#2C1810] placeholder:text-[#2C1810]/30"
              />
              <ContinueButton disabled={!name.trim()} onClick={goNext} />
            </div>
          )}

          {/* ── 3  Who ── */}
          {step === 3 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">Who do you want to do this with?</h1>
              <p className="text-sm text-[#2C1810]/50 mb-5">Pick people and propose times — they'll say which works.</p>

              {/* chips */}
              {selectedPeople.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedPeople.map((p) => (
                    <button
                      key={p.email}
                      onClick={() => togglePerson(p)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                      style={{ backgroundColor: "#C17F24", color: "#F7F0E6" }}
                    >
                      {p.name ? p.name.split(" ")[0] : p.email}
                      <span className="opacity-70 text-xs">×</span>
                    </button>
                  ))}
                </div>
              )}

              {/* existing connections */}
              {connections.length > 0 && (
                <div className="flex flex-col gap-2 mb-5">
                  {connections.map((person) => {
                    const sel = selectedPeople.some((p) => p.email === person.email);
                    return (
                      <button
                        key={person.email}
                        onClick={() => togglePerson(person)}
                        className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                          sel ? "border-[#C17F24] bg-[#C17F24]/5" : "border-[#e8d5b8] hover:border-[#C17F24]/30 bg-white"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0 text-sm ${
                          sel ? "bg-[#C17F24] text-white" : "bg-[#C17F24]/15 text-[#C17F24]"
                        }`}>
                          {(person.name || person.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[#2C1810] text-sm">{person.name || person.email}</div>
                          {person.name && <div className="text-xs text-[#2C1810]/50 truncate">{person.email}</div>}
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          sel ? "border-[#C17F24] bg-[#C17F24]" : "border-[#e8d5b8]"
                        }`}>
                          {sel && <span className="text-white text-xs">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#e8d5b8]" />
                <span className="text-xs text-[#2C1810]/40 uppercase tracking-widest">or invite someone new</span>
                <div className="flex-1 h-px bg-[#e8d5b8]" />
              </div>

              {/* new person rows */}
              <div className="flex flex-col gap-4">
                {newPeople.map((entry, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 flex flex-col gap-2">
                      <input
                        type="text"
                        value={entry.name}
                        onChange={(e) => setNewPeople((p) => { const c = [...p]; c[i] = { ...c[i], name: e.target.value }; return c; })}
                        placeholder="Name (optional)"
                        className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] placeholder:text-[#2C1810]/30 focus:outline-none focus:border-[#C17F24]/60"
                      />
                      <input
                        type="email"
                        value={entry.email}
                        onChange={(e) => setNewPeople((p) => { const c = [...p]; c[i] = { ...c[i], email: e.target.value }; return c; })}
                        placeholder="Email address"
                        className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] placeholder:text-[#2C1810]/30 focus:outline-none focus:border-[#C17F24]/60"
                      />
                    </div>
                    {newPeople.length > 1 && (
                      <button onClick={() => setNewPeople((p) => p.filter((_, j) => j !== i))} className="mt-2 text-[#2C1810]/30 hover:text-[#2C1810]/60 text-lg">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setNewPeople((p) => [...p, { name: "", email: "" }])} className="text-[#C17F24] text-sm text-left hover:underline">
                  + Add another person
                </button>
              </div>

              <ContinueButton disabled={!hasAtLeastOnePerson} onClick={continueWho} />
            </div>
          )}

          {/* ── 4  Rhythm ── */}
          {step === 4 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">How often do you want to gather?</h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">Your commitment to each other — Eleanor handles the rest.</p>
              <div className="flex flex-col gap-3">
                {RHYTHM_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setFrequency(o.value)}
                    className={`w-full text-left p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                      frequency === o.value ? "border-2 border-[#C17F24] bg-[#C17F24]/5" : "border-[#e8d5b8] hover:border-[#C17F24]/30"
                    }`}
                  >
                    <div>
                      <div className="font-medium text-[#2C1810]">{o.label}</div>
                      <div className="text-sm text-[#2C1810]/50">{o.tagline}</div>
                    </div>
                  </button>
                ))}
              </div>
              {frequency && (
                <p className="text-sm text-[#C17F24] italic mt-4">You want to gather {FREQ_LABEL[frequency]}.</p>
              )}
              {frequency && <ContinueButton onClick={goNext} />}
            </div>
          )}

          {/* ── 5  Goal ── */}
          {step === 5 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">How far do you want to grow?</h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">Pick a goal. Eleanor will tend it with you.</p>
              <div className="flex flex-col gap-3">
                {GOAL_OPTIONS.map((o) => (
                  <button
                    key={o.months}
                    onClick={() => setGoalMonths(o.months)}
                    className={`w-full text-left p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                      goalMonths === o.months ? "border-2 border-[#C17F24] bg-[#C17F24]/5" : "border-[#e8d5b8] hover:border-[#C17F24]/30"
                    }`}
                  >
                    <span className="text-2xl">{o.emoji}</span>
                    <div>
                      <div className="font-medium text-[#2C1810]">{o.label}</div>
                      <div className="text-sm text-[#2C1810]/50">
                        {o.months === 0 ? "No end date — tend it as long as it grows" : `${o.phase} · ${gatheringsFor(o.months)}`}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {goalMonths !== null && (
                <p className="text-sm text-[#C17F24] italic mt-4">
                  {goalMonths === 0
                    ? "As many gatherings as it takes."
                    : `${gatheringsFor(goalMonths)} to look forward to.`}
                </p>
              )}
              {goalMonths !== null && <ContinueButton onClick={goNext} />}
            </div>
          )}

          {/* ── 6  When ── */}
          {step === 6 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">When should you first gather?</h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">
                Pick your first choice and two alternates. Your group will say which works best.
              </p>

              <div className="flex flex-col gap-5">
                <div>
                  <label className="block text-xs font-semibold text-[#C17F24] uppercase tracking-widest mb-2">First pick</label>
                  <input
                    type="datetime-local"
                    value={firstPick}
                    onChange={(e) => setFirstPick(e.target.value)}
                    className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C17F24]/60 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2C1810]/40 uppercase tracking-widest mb-2">First alternative</label>
                  <input
                    type="datetime-local"
                    value={alt1}
                    onChange={(e) => setAlt1(e.target.value)}
                    className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C17F24]/60 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#2C1810]/40 uppercase tracking-widest mb-2">Second alternative</label>
                  <input
                    type="datetime-local"
                    value={alt2}
                    onChange={(e) => setAlt2(e.target.value)}
                    className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2.5 text-sm text-[#2C1810] focus:outline-none focus:border-[#C17F24]/60 bg-white"
                  />
                </div>
              </div>

              <ContinueButton disabled={!firstPick} onClick={goNext} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
