import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Sprout } from "lucide-react";

interface ScheduleData {
  ritualId: number;
  ritualName: string;
  frequency: string;
  organizerName: string;
  proposedTimes: string[];
  confirmedTime: string | null;
}

function formatFrequencyPhrase(f: string) {
  if (f === "biweekly") return "biweekly";
  if (f === "weekly") return "weekly";
  if (f === "monthly") return "monthly";
  return f;
}

export default function GuestSchedule() {
  const [, params] = useRoute("/schedule/:token");
  const token = params?.token ?? "";

  const [search] = useState(() => new URLSearchParams(window.location.search));
  const emailFromUrl = search.get("email") ?? "";

  const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState(emailFromUrl);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [suggestedTime, setSuggestedTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [nameError, setNameError] = useState("");

  useEffect(() => {
    if (!token) return;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/schedule/${token}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setScheduleData(data);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) {
      setNameError("Please enter your name");
      return;
    }
    setNameError("");
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/schedule/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestEmail: guestEmail.trim() || undefined,
          chosenTime: unavailable ? undefined : selectedTime,
          unavailable,
          suggestedTime: unavailable && suggestedTime.trim() ? suggestedTime.trim() : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
    } catch {
      setNameError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Sprout size={24} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <p className="text-muted-foreground">Loading your invitation...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Sprout size={24} strokeWidth={1.5} className="text-muted-foreground" />
          </div>
          <h2 className="font-serif text-2xl text-foreground">This link isn't active</h2>
          <p className="text-muted-foreground text-sm">The scheduling link may have expired or is no longer valid.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-6 max-w-sm"
        >
          <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="font-serif text-3xl text-foreground mb-2">
              {unavailable ? "Got it." : "You're in."}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {unavailable
                ? suggestedTime.trim()
                  ? "Your suggestion has been passed along. Hopefully a new time works."
                  : "Your response has been noted. Hopefully next time works."
                : "This is how traditions begin."}
            </p>
          </div>
          {!unavailable && (
            <p className="text-sm text-muted-foreground/70">
              {scheduleData?.organizerName} will confirm the final time shortly.
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  const times = scheduleData?.proposedTimes ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-6">
            <Sprout size={22} strokeWidth={1.5} />
          </div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">You're invited</p>
          <h1 className="font-serif text-3xl md:text-4xl text-foreground mb-3">{scheduleData?.ritualName}</h1>
          <p className="text-muted-foreground text-sm">
            {scheduleData?.organizerName} is scheduling a {formatFrequencyPhrase(scheduleData?.frequency ?? "")} gathering and wants to know when you're available.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name + email fields */}
          <div className="bg-card rounded-2xl p-5 border border-card-border space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-foreground">Your name</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => { setGuestName(e.target.value); setNameError(""); }}
                placeholder="How should we call you?"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
              />
              {nameError && <p className="text-sm text-destructive mt-1">{nameError}</p>}
            </div>
            {!emailFromUrl && (
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">
                  Email <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="For any updates from the organizer"
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                />
              </div>
            )}
            {emailFromUrl && (
              <input type="hidden" value={guestEmail} />
            )}
          </div>

          {/* Time options */}
          {!unavailable && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Which time works best for you?</p>
              <AnimatePresence>
                {times.map((t, i) => {
                  const d = parseISO(t);
                  const label = format(d, "EEEE, MMMM d 'at' h:mm a");
                  const isSelected = selectedTime === t;
                  return (
                    <motion.button
                      key={t}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.3 }}
                      onClick={() => setSelectedTime(t)}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div>
                        <p className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {i === 0 ? "Organizer's first pick" : i === 1 ? "Alternative" : "Backup"}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 size={20} className="text-primary flex-shrink-0" />
                      )}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Can't make it toggle */}
          <button
            type="button"
            onClick={() => { setUnavailable(!unavailable); setSelectedTime(null); setSuggestedTime(""); }}
            className={`w-full py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
              unavailable
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border text-muted-foreground hover:border-border hover:text-foreground"
            }`}
          >
            {unavailable ? "✓ Marked as unavailable — click to undo" : "I can't make any of these"}
          </button>

          {/* Suggest another time */}
          {unavailable && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-card rounded-2xl p-5 border border-card-border space-y-2"
            >
              <label className="block text-sm font-medium text-foreground">
                Suggest a time that works for you{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={suggestedTime}
                onChange={e => setSuggestedTime(e.target.value)}
                placeholder="e.g. Saturdays after 4pm, weekday mornings…"
                className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {scheduleData?.organizerName} will see your suggestion.
              </p>
            </motion.div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || (!unavailable && !selectedTime)}
            className="w-full py-4 bg-primary text-primary-foreground rounded-full font-medium text-base hover:bg-primary/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.2)] flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <><Loader2 size={18} className="animate-spin" /> Sending...</>
            ) : (
              unavailable ? "Send my response" : "I'm in for this time"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
