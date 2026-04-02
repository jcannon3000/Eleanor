import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { format, addHours } from "date-fns";

// ─── Step names ───────────────────────────────────────────────────────────────

const STEP_NAMES: Record<number, string> = {
  1: "Type",
  2: "Name",
  3: "Who",
  4: "Rhythm",
  5: "Goal",
  6: "First gathering",
};

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, goBack }: { step: number; goBack: () => void }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-[#6B8F71] font-medium">
          Step {step} of 6 — {STEP_NAMES[step]}
        </span>
        {step > 1 && (
          <button
            onClick={goBack}
            className="text-xs text-[#2C1810]/50 hover:text-[#2C1810] transition-colors"
          >
            ← Back
          </button>
        )}
      </div>
      <div className="w-full h-1 bg-[#e8d5b8] rounded-full">
        <div
          className="h-full bg-[#C17F24] rounded-full transition-all duration-300"
          style={{ width: `${(step / 6) * 100}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TraditionNew() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [step, setStep] = useState(1);
  const [type, setType] = useState<string>("custom");
  const [name, setName] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<{ name: string; email: string }[]>([]);
  const [newPeople, setNewPeople] = useState<{ name: string; email: string }[]>([{ name: "", email: "" }]);
  const [frequency, setFrequency] = useState<string>("");
  const [goalMonths, setGoalMonths] = useState<number | null>(null);
  const [selectedTime, setSelectedTime] = useState<Date | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [readableEmails, setReadableEmails] = useState<string[]>([]);
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showFallbackPicker, setShowFallbackPicker] = useState(false);
  const [fallbackDatetime, setFallbackDatetime] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);

  function goBack() {
    if (step > 1) setStep((s) => s - 1);
  }

  function goNext() {
    setStep((s) => s + 1);
  }

  // ─── Step 1 — Type ──────────────────────────────────────────────────────────

  const typeOptions = [
    { value: "coffee", emoji: "☕", label: "Coffee", tagline: "Share your first cup, again and again", prefillName: "Morning Coffee ☕" },
    { value: "meal", emoji: "🍽️", label: "A Meal", tagline: "The table is the oldest gathering place", prefillName: "Saturday Dinner 🍽️" },
    { value: "walk", emoji: "🚶", label: "A Walk", tagline: "Move together on a regular day", prefillName: "Our Weekly Walk 🚶" },
    { value: "run", emoji: "🏃", label: "A Run", tagline: "Keep the pace, keep the commitment", prefillName: "Morning Run 🏃" },
    { value: "custom", emoji: "🌱", label: "Something else", tagline: "Name your own tradition", prefillName: "" },
  ];

  function handleSelectType(value: string, _prefillName: string) {
    setType(value);
    setName("");
    goNext();
  }

  // ─── Step 2 — Name ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (step === 2 && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [step]);

  // ─── Step 3 — Who ───────────────────────────────────────────────────────────

  const { data: peopleData } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: () => apiRequest<{ connections: { name: string; email: string }[] }>("GET", "/api/connections"),
    enabled: step === 3,
  });

  const existingConnections: { name: string; email: string }[] =
    peopleData?.connections ?? [];

  function toggleExistingPerson(person: { name: string; email: string }) {
    setSelectedPeople((prev) => {
      const exists = prev.some((p) => p.email === person.email);
      if (exists) {
        return prev.filter((p) => p.email !== person.email);
      } else {
        return [...prev, { name: person.name, email: person.email }];
      }
    });
  }

  function updateNewPerson(index: number, field: "name" | "email", value: string) {
    setNewPeople((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addNewPersonRow() {
    setNewPeople((prev) => [...prev, { name: "", email: "" }]);
  }

  function removeNewPersonRow(index: number) {
    setNewPeople((prev) => prev.filter((_, i) => i !== index));
  }

  function handleContinueWho() {
    // Merge valid new people into selectedPeople
    const validNew = newPeople.filter((p) => p.email.trim() !== "");
    const merged = [...selectedPeople];
    for (const np of validNew) {
      if (!merged.some((p) => p.email === np.email)) {
        merged.push(np);
      }
    }
    setSelectedPeople(merged);
    goNext();
  }

  const hasAtLeastOnePerson =
    selectedPeople.length > 0 ||
    newPeople.some((p) => p.email.trim() !== "");

  // ─── Step 4 — Rhythm ────────────────────────────────────────────────────────

  const rhythmOptions = [
    { value: "weekly", emoji: "📅", label: "Every week", tagline: "A weekly rhythm" },
    { value: "biweekly", emoji: "📅", label: "Every two weeks", tagline: "A fortnightly ritual" },
    { value: "monthly", emoji: "📅", label: "Once a month", tagline: "A monthly anchor" },
  ];

  const frequencyLabel =
    frequency === "weekly"
      ? "every week"
      : frequency === "biweekly"
      ? "every two weeks"
      : frequency === "monthly"
      ? "once a month"
      : "";

  // ─── Step 5 — Goal ──────────────────────────────────────────────────────────

  const GATHERINGS_PER_MONTH: Record<string, number> = {
    weekly: 4,
    biweekly: 2,
    monthly: 1,
  };

  function gatheringsFor(months: number): string {
    const perMonth = GATHERINGS_PER_MONTH[frequency] ?? 4;
    const count = perMonth * months;
    return months === 1 ? `${count} gathering${count === 1 ? "" : "s"}` : `~${count} gatherings`;
  }

  const goalOptions = [
    { months: 1, emoji: "🌱", label: "One month", phase: "Taking root" },
    { months: 3, emoji: "🌿", label: "Three months", phase: "Growing" },
    { months: 6, emoji: "🌸", label: "Six months", phase: "In bloom" },
    { months: 0, emoji: "🌾", label: "Ongoing", phase: "" },
  ];

  function goalLabel(months: number): string {
    return gatheringsFor(months);
  }

  // ─── Step 6 — First gathering ───────────────────────────────────────────────

  const suggestMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/rituals/suggest-times-for-group", {
        memberEmails: selectedPeople.map((p) => p.email),
        frequency,
        type,
        tzOffset: new Date().getTimezoneOffset(),
      }).then((r) => r.json()),
    onSuccess: (data) => {
      setSuggestions(data.suggestions ?? []);
      setReadableEmails(data.readableEmails ?? []);
      setSuggestionsLoaded(true);
      setSuggestionsError(false);
    },
    onError: () => {
      setSuggestionsLoaded(true);
      setSuggestionsError(true);
    },
  });

  useEffect(() => {
    if (step === 6 && !suggestionsLoaded && !suggestMutation.isPending) {
      suggestMutation.mutate();
    }
  }, [step]);

  function slotDayType(iso: string): string {
    const d = new Date(iso);
    const dow = d.getDay();
    const hour = d.getHours();
    if (dow === 0 || dow === 6) return "Weekend 🌅";
    if (hour < 12) return "Morning 🌿";
    return "After work 🌿";
  }

  function allMembersReadable(): boolean {
    return selectedPeople.every((p) => readableEmails.includes(p.email));
  }

  // ─── Confirmation ────────────────────────────────────────────────────────────

  async function handleSendInvites() {
    if (!user || !selectedTime) return;
    setIsCreating(true);
    try {
      const createRes = await apiRequest("POST", "/api/rituals", {
        name,
        frequency,
        participants: selectedPeople,
        intention: `A ${type} tradition. Together.`,
        ownerId: user.id,
        dayPreference: "",
      });
      const ritual = await createRes.json();
      const ritualId = ritual.id;

      await apiRequest("PATCH", `/api/rituals/${ritualId}/proposed-times`, {
        proposedTimes: [selectedTime.toISOString()],
        confirmedTime: selectedTime.toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/rituals"] });
      setLocation(`/ritual/${ritualId}`);
    } catch (err) {
      console.error("Failed to create ritual", err);
    } finally {
      setIsCreating(false);
    }
  }

  const firstNames = selectedPeople.map((p) => (p.name ? p.name.split(" ")[0] : p.email)).join(", ");

  // ─── Render ──────────────────────────────────────────────────────────────────

  // Confirmation screen
  if (step === 7) {
    return (
      <div className="min-h-screen bg-[#2C1810] flex flex-col items-center justify-center px-6 py-12">
        <div className="text-6xl mb-6">🌱</div>
        <h1 className="font-serif text-3xl text-[#F7F0E6] text-center mb-3">
          Your {name} is planted.
        </h1>
        <p className="text-[#F7F0E6]/60 text-sm text-center mb-8">
          {frequency === "weekly"
            ? "Every week"
            : frequency === "biweekly"
            ? "Every two weeks"
            : frequency === "monthly"
            ? "Once a month"
            : "Regular gatherings"}{" "}
          · First gathering{" "}
          {selectedTime ? format(selectedTime, "MMMM d") : ""}
          {firstNames ? ` · with ${firstNames}` : ""}
        </p>
        <button
          onClick={handleSendInvites}
          disabled={isCreating}
          className="bg-[#F7F0E6] text-[#2C1810] rounded-2xl px-8 py-4 font-semibold text-base w-full max-w-xs mb-4 hover:bg-[#ede6da] transition-colors disabled:opacity-60"
        >
          {isCreating ? "Planting… 🌱" : "Send invites 🌿"}
        </button>
        <button
          onClick={() => setLocation("/")}
          className="text-[#F7F0E6]/40 hover:text-[#F7F0E6]/70 text-sm transition-colors"
        >
          ← Back to garden
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] px-4 py-8">
      <div className="max-w-lg mx-auto">
        {step <= 6 && <ProgressBar step={step} goBack={goBack} />}

        <div className="bg-white rounded-3xl shadow-sm border border-[#C17F24]/15 p-6 md:p-8">

          {/* ── Step 1: Type ── */}
          {step === 1 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                What will you tend together? 🌱
              </h1>
              <p className="text-muted-foreground text-sm italic mb-6">
                Recurring gatherings are where belonging forms.
              </p>
              <div className="flex flex-col gap-3">
                {typeOptions.map((opt) => (
                  <button
                    key={opt.value + opt.label}
                    onClick={() => handleSelectType(opt.value, opt.prefillName)}
                    className="w-full text-left p-4 rounded-2xl border border-[#e8d5b8] hover:border-[#C17F24]/50 hover:bg-[#C17F24]/5 transition-all flex items-center gap-4"
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <div>
                      <div className="font-medium text-[#2C1810]">{opt.label}</div>
                      <div className="text-sm text-[#2C1810]/50">{opt.tagline}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 2: Name ── */}
          {step === 2 && (
            <div>
              <p className="text-xs text-[#C17F24] font-medium tracking-widest uppercase mb-3">
                Start a Tradition
              </p>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                What do you want to call it?
              </h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">
                Give your ritual a simple, clear name.
              </p>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Morning Coffee ☕"
                className="w-full text-2xl font-serif bg-transparent border-b-2 border-[#C17F24]/40 focus:border-[#C17F24] outline-none py-3 text-[#2C1810] placeholder:text-[#2C1810]/30"
              />
              <div className="flex justify-end mt-8">
                <button
                  onClick={goNext}
                  disabled={!name.trim()}
                  className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors disabled:opacity-40"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Who ── */}
          {step === 3 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                Who will tend this with you? 🌱
              </h1>
              <p className="text-sm text-[#2C1810]/50 mb-5">
                Add at least one person. Eleanor will coordinate everyone's calendars.
              </p>

              {existingConnections.length > 0 && (
                <div className="max-h-[280px] overflow-y-auto flex flex-col gap-2 mb-5">
                  {existingConnections.map((person) => {
                    const added = selectedPeople.some((p) => p.email === person.email);
                    return (
                      <button
                        key={person.email}
                        onClick={() => toggleExistingPerson(person)}
                        className={`w-full text-left p-3 rounded-2xl border flex items-center gap-3 transition-all ${
                          added
                            ? "border-[#C17F24] bg-[#C17F24]/5"
                            : "border-[#e8d5b8] hover:border-[#C17F24]/30"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-[#C17F24]/15 flex items-center justify-center text-[#C17F24] font-semibold flex-shrink-0">
                          {(person.name || person.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-[#2C1810] text-sm">{person.name || person.email}</div>
                          {person.name && (
                            <div className="text-xs text-[#2C1810]/50 truncate">{person.email}</div>
                          )}
                        </div>
                        {added && (
                          <span className="text-[#C17F24] font-semibold text-sm">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-[#e8d5b8]" />
                <span className="text-xs text-[#2C1810]/40 uppercase tracking-widest">
                  or invite someone new
                </span>
                <div className="flex-1 h-px bg-[#e8d5b8]" />
              </div>

              {/* New person entries */}
              <div className="flex flex-col gap-4">
                {newPeople.map((entry, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1 flex flex-col gap-2">
                      <input
                        type="text"
                        value={entry.name}
                        onChange={(e) => updateNewPerson(index, "name", e.target.value)}
                        placeholder="Name (optional)"
                        className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] placeholder:text-[#2C1810]/30 focus:outline-none focus:border-[#C17F24]/60"
                      />
                      <input
                        type="email"
                        value={entry.email}
                        onChange={(e) => updateNewPerson(index, "email", e.target.value)}
                        placeholder="Email address"
                        className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] placeholder:text-[#2C1810]/30 focus:outline-none focus:border-[#C17F24]/60"
                      />
                    </div>
                    {newPeople.length > 1 && (
                      <button
                        onClick={() => removeNewPersonRow(index)}
                        className="mt-2 text-[#2C1810]/30 hover:text-[#2C1810]/60 transition-colors text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={addNewPersonRow}
                  className="text-[#C17F24] text-sm text-left hover:underline"
                >
                  + Add another person
                </button>
              </div>

              <div className="flex justify-end mt-8">
                <button
                  onClick={handleContinueWho}
                  disabled={!hasAtLeastOnePerson}
                  className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors disabled:opacity-40"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Rhythm ── */}
          {step === 4 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                How often do you want to gather? 🌿
              </h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">
                This is your commitment to each other — not a schedule. Eleanor will handle making it happen.
              </p>
              <div className="flex flex-col gap-3">
                {rhythmOptions.map((opt) => {
                  const active = frequency === opt.value && frequency !== "";
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFrequency(opt.value)}
                      className={`w-full text-left p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        active
                          ? "border-2 border-[#C17F24] bg-[#C17F24]/5"
                          : "border border-[#e8d5b8] hover:border-[#C17F24]/30"
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-medium text-[#2C1810]">{opt.label}</div>
                        <div className="text-sm text-[#2C1810]/50">{opt.tagline}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {frequency && (
                <p className="text-sm text-[#C17F24] italic mt-4">
                  You want to gather {frequencyLabel}. Eleanor will find the time.
                </p>
              )}
              {frequency && (
                <div className="flex justify-end mt-6">
                  <button
                    onClick={goNext}
                    className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors"
                  >
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 5: Goal ── */}
          {step === 5 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                How far do you want to grow? 🌱
              </h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">
                Pick a goal. Eleanor will tend it with you.
              </p>
              <div className="flex flex-col gap-3">
                {goalOptions.map((opt) => {
                  const active = goalMonths === opt.months;
                  return (
                    <button
                      key={opt.months}
                      onClick={() => setGoalMonths(opt.months)}
                      className={`w-full text-left p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                        active
                          ? "border-2 border-[#C17F24] bg-[#C17F24]/5"
                          : "border border-[#e8d5b8] hover:border-[#C17F24]/30"
                      }`}
                    >
                      <span className="text-2xl">{opt.emoji}</span>
                      <div>
                        <div className="font-medium text-[#2C1810]">{opt.label}</div>
                        <div className="text-sm text-[#2C1810]/50">
                          {opt.months === 0
                            ? "No end date — tend it as long as it grows"
                            : `${opt.phase} · ${gatheringsFor(opt.months)}`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {goalMonths !== null && (
                <p className="text-sm text-[#C17F24] italic mt-4">
                  {goalMonths === 0
                    ? "As many gatherings as it takes. Eleanor will make sure they happen."
                    : `${gatheringsFor(goalMonths)} to look forward to. Eleanor will make sure they happen.`}
                </p>
              )}
              {goalMonths !== null && (
                <div className="flex justify-end mt-6">
                  <button
                    onClick={goNext}
                    className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors"
                  >
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Step 6: First gathering ── */}
          {step === 6 && (
            <div>
              <h1 className="font-serif text-3xl text-[#2C1810] mb-2">
                When should you first gather? 🌿
              </h1>
              <p className="text-sm text-[#2C1810]/50 mb-6">
                Eleanor looked at everyone's calendars and found times that work.
              </p>

              {/* Loading state */}
              {!suggestionsLoaded && (
                <div className="flex flex-col items-center py-10 gap-3">
                  <p className="text-[#2C1810]/60 text-sm animate-pulse">
                    Eleanor is looking at everyone's calendars… 🌿
                  </p>
                </div>
              )}

              {/* Error: fallback picker */}
              {suggestionsLoaded && suggestionsError && (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-[#2C1810]/50">
                    Choose a time to propose to the group.
                  </p>
                  <input
                    type="datetime-local"
                    value={fallbackDatetime}
                    onChange={(e) => {
                      setFallbackDatetime(e.target.value);
                      if (e.target.value) {
                        setSelectedTime(new Date(e.target.value));
                      }
                    }}
                    className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] focus:outline-none focus:border-[#C17F24]/60"
                  />
                </div>
              )}

              {/* Suggestion cards */}
              {suggestionsLoaded && !suggestionsError && (
                <div className="flex flex-col gap-3">
                  {suggestions.map((iso) => {
                    const d = new Date(iso);
                    const isSelected = selectedTime?.toISOString() === d.toISOString();
                    const dayType = slotDayType(iso);
                    const worksForAll = allMembersReadable();
                    return (
                      <button
                        key={iso}
                        onClick={() => setSelectedTime(d)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? "border-2 border-[#C17F24] bg-[#C17F24]/5"
                            : "border border-[#e8d5b8] hover:border-[#C17F24]/30"
                        }`}
                      >
                        <div className="font-medium text-[#2C1810]">
                          {format(d, "EEEE, MMMM d")}
                        </div>
                        <div className="text-sm text-[#2C1810]/70 mt-0.5">
                          {format(d, "h:mm a")} – {format(addHours(d, 1), "h:mm a")}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-[#2C1810]/40">{dayType}</span>
                          {worksForAll ? (
                            <span className="text-xs text-[#6B8F71]">Works for everyone 🌿</span>
                          ) : (
                            <span className="text-xs text-[#2C1810]/30">Based on available calendars</span>
                          )}
                        </div>
                      </button>
                    );
                  })}

                  {/* Fallback link */}
                  {!showFallbackPicker && (
                    <button
                      onClick={() => setShowFallbackPicker(true)}
                      className="text-sm text-[#2C1810]/40 hover:text-[#2C1810]/60 transition-colors text-left mt-1"
                    >
                      None of these work → Choose a different time
                    </button>
                  )}

                  {showFallbackPicker && (
                    <div className="mt-2">
                      <input
                        type="datetime-local"
                        value={fallbackDatetime}
                        onChange={(e) => {
                          setFallbackDatetime(e.target.value);
                          if (e.target.value) {
                            setSelectedTime(new Date(e.target.value));
                          }
                        }}
                        className="w-full border border-[#e8d5b8] rounded-xl px-3 py-2 text-sm text-[#2C1810] focus:outline-none focus:border-[#C17F24]/60"
                      />
                    </div>
                  )}
                </div>
              )}

              {(suggestionsLoaded) && (
                <div className="flex justify-end mt-8">
                  <button
                    onClick={goNext}
                    disabled={!selectedTime}
                    className="bg-[#C17F24] text-white rounded-2xl px-6 py-3 font-medium hover:bg-[#A06B1A] transition-colors disabled:opacity-40"
                  >
                    Continue →
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
