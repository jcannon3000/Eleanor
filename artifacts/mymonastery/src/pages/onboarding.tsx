import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sprout, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Mode = "signin" | "register";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchParams = new URLSearchParams(window.location.search);
  const redirectTo = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    if (!isLoading && user) setLocation(redirectTo);
  }, [user, isLoading, setLocation, redirectTo]);

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !email.includes("@")) {
      setError("Enter a valid email address."); return;
    }
    if (mode === "register" && !name.trim()) {
      setError("Enter your name."); return;
    }
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters."); return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const body = mode === "register"
        ? { email: email.trim(), name: name.trim(), password }
        : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.ok) {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setLocation(redirectTo);
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
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

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
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

            {/* Form card */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.58 }}
              className="max-w-sm w-full mx-auto md:mx-0"
            >
              {/* Mode toggle */}
              <div className="flex rounded-xl bg-muted/50 border border-border p-1 mb-5">
                {(["signin", "register"] as Mode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      mode === m
                        ? "bg-card shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.form
                  key={mode}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-3"
                >
                  {mode === "register" && (
                    <input
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={e => { setName(e.target.value); setError(""); }}
                      className="w-full px-4 py-3.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      autoComplete="name"
                      disabled={submitting}
                    />
                  )}

                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setError(""); }}
                    className="w-full px-4 py-3.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                    autoComplete="email"
                    disabled={submitting}
                  />

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }}
                      className="w-full px-4 py-3.5 pr-11 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground/60 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                      autoComplete={mode === "register" ? "new-password" : "current-password"}
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive px-1">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center justify-center w-full px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-60 mt-1"
                  >
                    {submitting ? (
                      <div className="w-4 h-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                    ) : mode === "signin" ? "Sign in" : "Create account"}
                  </button>
                </motion.form>
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
