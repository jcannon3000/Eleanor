import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Loader2, Sprout, Calendar, MapPin, Pencil, X,
  RefreshCw, UserCheck, Clock,
} from "lucide-react";

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
  const map: Record<string, string> = { weekly: "Weekly", biweekly: "Every two weeks", monthly: "Monthly" };
  return <>{map[f] ?? f}</>;
}

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

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
  const [isEditing, setIsEditing] = useState(false);
  const [editTime, setEditTime] = useState<string | null>(null);
  const [editUnavailable, setEditUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [justUpdated, setJustUpdated] = useState(false);

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
        body: JSON.stringify({ chosenTime: unavailable ? undefined : selectedTime, unavailable }),
      });
      if (!res.ok) throw new Error("Failed");
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async () => {
    if (!editUnavailable && !editTime) {
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
          chosenTime: editUnavailable ? undefined : editTime,
          unavailable: editUnavailable,
          isUpdate: true,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSelectedTime(editTime);
      setUnavailable(editUnavailable);
      setIsEditing(false);
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 4000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = () => {
    setEditTime(selectedTime);
    setEditUnavailable(unavailable);
    setError("");
    setIsEditing(true);
  };

  const handleGoogleSignIn = () => { window.location.href = "/api/auth/google"; };

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
            <GoogleIcon />
            Sign in to Eleanor
          </a>
        </div>
      </div>
    );
  }

  const times = data?.proposedTimes ?? [];
  const isConfirmed = !!data?.confirmedTime;

  // ─── DASHBOARD VIEW (after responding) ──────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-lg mx-auto px-4 py-10">
          {/* Brand */}
          <div className="flex items-center gap-2 mb-8 justify-center">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sprout size={14} className="text-primary" strokeWidth={1.5} />
            </div>
            <span className="font-serif text-sm font-bold text-muted-foreground" style={{ letterSpacing: "-0.025em" }}>Eleanor</span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-4"
          >
            {/* Ritual header */}
            <div className="text-center pb-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">
                {data?.organizerName}'s tradition
              </p>
              <h1 className="font-serif text-3xl text-foreground mb-2">{data?.ritualName}</h1>
              {data?.ritualIntention && (
                <p className="text-sm text-muted-foreground leading-relaxed">{data.ritualIntention}</p>
              )}
              <div className="flex items-center justify-center gap-3 mt-2 text-xs text-muted-foreground">
                {data?.frequency && <span><FrequencyLabel f={data.frequency} /></span>}
                {data?.location && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="flex items-center gap-1"><MapPin size={10} />{data.location}</span>
                  </>
                )}
              </div>
            </div>

            {/* Updated banner */}
            <AnimatePresence>
              {justUpdated && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-2 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl text-sm text-primary"
                >
                  <RefreshCw size={14} />
                  <span>Availability updated — {data?.organizerName}'s calendar has been notified.</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Availability card — the main dashboard panel */}
            <div className="bg-card border border-card-border rounded-2xl overflow-hidden shadow-[var(--shadow-warm-sm)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <UserCheck size={15} className="text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Your availability</span>
                </div>
                {!isEditing && (
                  <button
                    onClick={openEdit}
                    className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <Pencil size={12} />
                    Change
                  </button>
                )}
              </div>

              {/* Current response */}
              <AnimatePresence mode="wait">
                {!isEditing ? (
                  <motion.div
                    key="response"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-5 py-5"
                  >
                    {unavailable ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <X size={16} className="text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Marked unavailable</p>
                          <p className="text-xs text-muted-foreground mt-0.5">You'll be included in the next round</p>
                        </div>
                      </div>
                    ) : selectedTime ? (
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <CheckCircle2 size={16} className="text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">
                            {format(parseISO(selectedTime), "EEEE, MMMM d")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(selectedTime), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">No preference recorded.</p>
                    )}

                    <div className="mt-4 pt-4 border-t border-border/40 flex items-start gap-2">
                      <Calendar size={13} className="text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {data?.organizerName}'s calendar reflects your preference.
                        They'll confirm the final time for <span className="font-medium text-foreground">{data?.ritualName}</span>.
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  /* ── Inline edit panel ── */
                  <motion.div
                    key="edit"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="px-5 py-5 space-y-3"
                  >
                    <p className="text-sm text-muted-foreground">Choose a different time:</p>

                    {times.map((t, i) => {
                      const d = parseISO(t);
                      const isSelected = editTime === t && !editUnavailable;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setEditTime(t); setEditUnavailable(false); }}
                          className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-border bg-background hover:border-primary/40"
                          }`}
                        >
                          <div>
                            <p className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                              {format(d, "EEEE, MMMM d 'at' h:mm a")}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {i === 0 ? "First pick" : i === 1 ? "Alternative" : "Backup option"}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 size={17} className="text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => { setEditUnavailable(!editUnavailable); setEditTime(null); }}
                      className={`w-full py-3 px-4 rounded-xl border text-sm font-medium transition-all ${
                        editUnavailable
                          ? "border-destructive/40 bg-destructive/5 text-destructive"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {editUnavailable ? "✓ Unavailable — click to undo" : "None of these work for me"}
                    </button>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <div className="flex gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => { setIsEditing(false); setError(""); }}
                        className="flex-1 py-2.5 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleEditSubmit}
                        disabled={isSubmitting || (!editUnavailable && !editTime)}
                        className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                      >
                        {isSubmitting ? (
                          <><Loader2 size={14} className="animate-spin" /> Saving...</>
                        ) : (
                          "Save changes"
                        )}
                      </button>
                    </div>

                    <div className="flex items-start gap-2 pt-1">
                      <Clock size={12} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Saving will update {data?.organizerName}'s calendar event and notify them of your new preference.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Ritual detail card */}
            <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">The tradition</p>
              <p className="font-semibold text-foreground">{data?.ritualName}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {data?.ritualIntention || `A recurring ${data?.frequency ?? ""} gathering organized by ${data?.organizerName ?? "your host"}.`}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                {data?.frequency && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                    <RefreshCw size={10} />
                    <FrequencyLabel f={data.frequency} />
                  </span>
                )}
                {data?.location && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full">
                    <MapPin size={10} />
                    {data.location}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Hosted by <span className="font-medium text-foreground">{data?.organizerName}</span>
              </p>
            </div>

            {/* Join Eleanor CTA */}
            <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sprout size={14} className="text-primary" />
                <p className="text-sm font-semibold text-foreground">Want to host your own traditions?</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Eleanor coordinates recurring gatherings — so the people and traditions you love keep showing up.
              </p>
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-5 py-3 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <GoogleIcon />
                Start with Google — it's free
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── INITIAL PICKER VIEW ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Eleanor branding */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sprout size={14} className="text-primary" strokeWidth={1.5} />
          </div>
          <span className="font-serif text-sm font-bold text-muted-foreground" style={{ letterSpacing: "-0.025em" }}>Eleanor</span>
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
                    !unavailable && selectedTime ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  ✓ I'll be there
                </button>
                <button
                  type="button"
                  onClick={() => { setUnavailable(true); setSelectedTime(null); }}
                  className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                    unavailable ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border text-muted-foreground hover:border-border"
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
                        isSelected ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/40"
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
                unavailable ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border text-muted-foreground hover:text-foreground"
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

        <div className="mt-10 pt-8 border-t border-border text-center space-y-3">
          <p className="text-xs text-muted-foreground">Want to start your own traditions?</p>
          <button
            onClick={handleGoogleSignIn}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-border rounded-full text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <GoogleIcon />
            Join Eleanor with Google
          </button>
        </div>
      </div>
    </div>
  );
}
