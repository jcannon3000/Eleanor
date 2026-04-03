import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, ArrowRight, Mail } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Step = "email" | "name" | "sent";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const authError = searchParams.get("error");

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!email.trim() || !email.includes("@")) {
      setFormError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (data.needsName) {
        setStep("name");
      } else if (data.ok) {
        setStep("sent");
      } else {
        setFormError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!name.trim()) {
      setFormError("Please enter your name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep("sent");
      } else {
        setFormError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const errorMessage =
    authError === "link_expired"
      ? "That link has expired. Enter your email below to get a new one."
      : authError
      ? "Something went wrong with sign-in. Please try again."
      : "";

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Subtle organic background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/4 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-accent/5 blur-3xl" />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05 }}
        className="absolute top-0 w-full z-10 p-6 md:p-8 flex items-center max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <Sprout size={20} strokeWidth={1.5} />
          </div>
          <span className="font-serif text-xl font-bold text-foreground" style={{ letterSpacing: "-0.025em" }}>Eleanor</span>
        </div>
      </motion.header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 pt-24 pb-12">
        <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 max-w-5xl mx-auto w-full">

          {/* Left: copy + form */}
          <div className="flex-1 text-center md:text-left">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 text-primary text-sm font-medium mb-6 border border-primary/15"
            >
              <Sprout size={13} />
              <span>A personal assistant for community building</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.32 }}
              className="text-5xl md:text-6xl font-serif text-foreground leading-tight mb-6"
            >
              Grow what matters,{" "}
              <span className="text-primary italic">together</span>.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.46 }}
              className="text-lg text-muted-foreground mb-10 max-w-md mx-auto md:mx-0 leading-relaxed"
            >
              Eleanor turns one-time plans into traditions — coordinating everyone's calendars so the things worth repeating actually do.
            </motion.p>

            {/* Auth error */}
            {(errorMessage || formError) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-6 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20 max-w-sm mx-auto md:mx-0"
              >
                {formError || errorMessage}
              </motion.div>
            )}

            {/* Form area */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.58 }}
              className="max-w-sm w-full mx-auto md:mx-0"
            >
              <AnimatePresence mode="wait">
                {step === "email" && (
                  <motion.form
                    key="email-step"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    onSubmit={handleEmailSubmit}
                    className="flex flex-col gap-3"
                  >
                    <div className="relative">
                      <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setFormError(""); }}
                        className="w-full pl-11 pr-4 py-4 rounded-2xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground/60 text-base focus:outline-none focus:border-primary/50 transition-colors"
                        autoFocus
                        autoComplete="email"
                        disabled={submitting}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-2xl bg-primary text-primary-foreground font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {submitting ? (
                        <div className="w-5 h-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      ) : (
                        <>Continue <ArrowRight size={16} /></>
                      )}
                    </button>
                  </motion.form>
                )}

                {step === "name" && (
                  <motion.form
                    key="name-step"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25 }}
                    onSubmit={handleNameSubmit}
                    className="flex flex-col gap-3"
                  >
                    <p className="text-sm text-muted-foreground mb-1">
                      Welcome! What should we call you?
                    </p>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={e => { setName(e.target.value); setFormError(""); }}
                      className="w-full px-4 py-4 rounded-2xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground/60 text-base focus:outline-none focus:border-primary/50 transition-colors"
                      autoFocus
                      autoComplete="name"
                      disabled={submitting}
                    />
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex items-center justify-center gap-2 w-full px-6 py-4 rounded-2xl bg-primary text-primary-foreground font-medium text-base transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {submitting ? (
                        <div className="w-5 h-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                      ) : (
                        <>Send my link <ArrowRight size={16} /></>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep("email"); setFormError(""); }}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      ← Back
                    </button>
                  </motion.form>
                )}

                {step === "sent" && (
                  <motion.div
                    key="sent-step"
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="px-6 py-5 rounded-2xl bg-card border-2 border-border text-left"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Mail size={18} />
                      </div>
                      <p className="font-medium text-foreground">Check your inbox</p>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      We sent a sign-in link to <strong className="text-foreground">{email}</strong>. Click it to continue — no password needed.
                    </p>
                    <p className="text-xs text-muted-foreground/70 mt-3">
                      This is also the email calendar invites will be sent to.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setStep("email"); setFormError(""); }}
                      className="mt-4 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Wrong email? Start over
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Right: hero image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="flex-1 hidden md:block w-full"
          >
            <div className="relative rounded-[2rem] overflow-hidden aspect-[4/3] shadow-[var(--shadow-warm-xl)] border border-white/20">
              <div className="absolute inset-0 bg-primary/5 mix-blend-multiply pointer-events-none z-10" />
              <img
                src={`${import.meta.env.BASE_URL}images/onboarding-hero.png`}
                alt="Abstract growth art"
                className="w-full h-full object-cover"
              />
            </div>

            {/* Floating cards */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="mt-6 flex gap-3"
            >
              {[
                { label: "Thursday Run Crew", weeks: "8 weeks growing" },
                { label: "Monthly Dinner", weeks: "Just planted" },
              ].map((c, i) => (
                <div key={i} className="flex-1 bg-card rounded-2xl px-4 py-3 border border-card-border shadow-[var(--shadow-warm-sm)]">
                  <p className="font-serif text-sm text-foreground mb-1">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.weeks}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
