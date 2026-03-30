import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Sprout, Calendar, MapPin } from "lucide-react";

interface InviteData {
  ritualId: number;
  ritualName: string;
  ritualIntention: string | null;
  frequency: string;
  location: string | null;
  organizerName: string;
  proposedTimes: string[];
  confirmedTime: string | null;
  inviteeName: string | null;
  inviteeEmail: string;
  hasResponded: boolean;
  previousResponse: { chosenTime: string | null; unavailable: boolean } | null;
}

function FrequencyLabel({ f }: { f: string }) {
  const map: Record<string, string> = {
    weekly: "weekly",
    biweekly: "every two weeks",
    monthly: "monthly",
  };
  return <>{map[f] ?? f}</>;
}

export default function InvitePage() {
  const [, params] = useRoute("/invite/:token");
  const token = params?.token ?? "";

  const [data, setData] = useState<InviteData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    async function load() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/invite/${token}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed");
        const d: InviteData = await res.json();
        setData(d);
        if (d.hasResponded && d.previousResponse) {
          setSubmitted(true);
          setSelectedTime(d.previousResponse.chosenTime);
          setUnavailable(d.previousResponse.unavailable);
        }
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
    if (!unavailable && !selectedTime) {
      setError("Please pick a time or mark yourself as unavailable.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/invite/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chosenTime: unavailable ? undefined : selectedTime,
          unavailable,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = () => {
    window.location.href = "/api/auth/google";
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
          <p className="text-muted-foreground text-sm">The invite link may have expired or is no longer valid.</p>
          <a
            href="/api/auth/google"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
            Sign in to Eleanor
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-6"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <CheckCircle2 size={36} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="font-serif text-3xl text-foreground mb-2">
                {unavailable ? "Response noted." : "You're in."}
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                {unavailable
                  ? "Hopefully the next one works out."
                  : `${data?.organizerName} will confirm the final time and send a calendar invite.`}
              </p>
            </div>

            {selectedTime && !unavailable && (
              <div className="bg-card border border-card-border rounded-2xl p-4 text-left">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">Your pick</p>
                <p className="font-medium text-foreground">{format(parseISO(selectedTime), "EEEE, MMMM d 'at' h:mm a")}</p>
              </div>
            )}

            {/* Join Eleanor CTA */}
            <div className="bg-card border border-card-border rounded-2xl p-6 text-left space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <Sprout size={16} className="text-primary" />
                <p className="text-sm font-semibold text-foreground">Keep your traditions alive</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Eleanor helps you turn one-time plans into recurring rituals — coordinating everyone's schedules so the gatherings you love actually happen.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-5 py-3 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </button>
              <p className="text-xs text-muted-foreground text-center">Free to use · No credit card needed</p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const times = data?.proposedTimes ?? [];
  const isConfirmed = !!data?.confirmedTime;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Eleanor branding */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sprout size={14} className="text-primary" strokeWidth={1.5} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">Eleanor</span>
        </div>

        {/* Ritual header */}
        <div className="text-center mb-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">
            {data?.organizerName} is inviting you to
          </p>
          <h1 className="font-serif text-3xl md:text-4xl text-foreground mb-3">{data?.ritualName}</h1>
          <p className="text-muted-foreground text-sm leading-relaxed mb-3">
            {data?.ritualIntention || `A recurring ${data?.frequency ?? ""} gathering organized by ${data?.organizerName ?? "your host"}.`}
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="capitalize"><FrequencyLabel f={data?.frequency ?? ""} /> gathering</span>
            {data?.location && (
              <>
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1"><MapPin size={11} /> {data.location}</span>
              </>
            )}
          </div>
        </div>

        {isConfirmed ? (
          /* Time is confirmed — show the confirmed time and ask for RSVP */
          <div className="space-y-6">
            <div className="bg-card border border-card-border rounded-2xl p-6 text-center shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Calendar size={16} className="text-primary" />
                <span className="text-sm font-semibold text-primary uppercase tracking-wide">Confirmed Time</span>
              </div>
              <p className="text-2xl font-semibold text-foreground mb-1">
                {format(parseISO(data!.confirmedTime!), "EEEE, MMMM d")}
              </p>
              <p className="text-lg text-muted-foreground">
                {format(parseISO(data!.confirmedTime!), "h:mm a")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setUnavailable(false); setSelectedTime(data!.confirmedTime); }}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                    !unavailable && selectedTime
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  ✓ I'll be there
                </button>
                <button
                  type="button"
                  onClick={() => { setUnavailable(true); setSelectedTime(null); }}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                    unavailable
                      ? "border-destructive/40 bg-destructive/5 text-destructive"
                      : "border-border text-muted-foreground hover:border-border"
                  }`}
                >
                  Can't make it
                </button>
              </div>
              {error && <p className="text-sm text-destructive text-center">{error}</p>}
              <button
                type="submit"
                disabled={isSubmitting || (!unavailable && !selectedTime)}
                className="w-full py-4 bg-primary text-primary-foreground rounded-full font-medium text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.2)] flex items-center justify-center gap-2"
              >
                {isSubmitting ? <><Loader2 size={18} className="animate-spin" /> Sending...</> : "Send my response"}
              </button>
            </form>
          </div>
        ) : (
          /* No confirmed time yet — show proposed times for voting */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">{data?.organizerName} is proposing these times.</p>
              <p className="text-sm text-muted-foreground mb-4">Which works best for you?</p>

              <AnimatePresence>
                {times.map((t, i) => {
                  const d = parseISO(t);
                  const isSelected = selectedTime === t;
                  return (
                    <motion.button
                      key={t}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07, duration: 0.3 }}
                      onClick={() => { setSelectedTime(t); setUnavailable(false); }}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all flex items-center justify-between gap-3 mb-3 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div>
                        <p className={`font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {format(d, "EEEE, MMMM d 'at' h:mm a")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {i === 0 ? "First pick" : i === 1 ? "Alternative" : "Backup option"}
                        </p>
                      </div>
                      {isSelected && <CheckCircle2 size={20} className="text-primary flex-shrink-0" />}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={() => { setUnavailable(!unavailable); setSelectedTime(null); }}
              className={`w-full py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                unavailable
                  ? "border-destructive/40 bg-destructive/5 text-destructive"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {unavailable ? "✓ Marked unavailable — click to undo" : "None of these work for me"}
            </button>

            {error && <p className="text-sm text-destructive text-center">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting || (!unavailable && !selectedTime)}
              className="w-full py-4 bg-primary text-primary-foreground rounded-full font-medium text-base hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.2)] flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <><Loader2 size={18} className="animate-spin" /> Sending...</>
              ) : (
                unavailable ? "Send my response" : "This time works for me"
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center">
              No account needed · Your response goes directly to {data?.organizerName}
            </p>
          </form>
        )}

        {/* Footer sign-in prompt */}
        <div className="mt-10 pt-8 border-t border-border text-center space-y-3">
          <p className="text-xs text-muted-foreground">Want to start your own circles?</p>
          <button
            onClick={handleGoogleSignIn}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-border rounded-full text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Join Eleanor with Google
          </button>
        </div>
      </div>
    </div>
  );
}
