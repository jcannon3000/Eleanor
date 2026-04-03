import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sprout } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const authError = searchParams.get("error");

  useEffect(() => {
    if (!isLoading && user) {
      setLocation("/dashboard");
    }
  }, [user, isLoading, setLocation]);

  const handleGoogleSignIn = () => {
    const url = `${window.location.origin}/api/auth/google`;
    try {
      const target = window.top ?? window;
      target.location.href = url;
    } catch {
      window.open(url, "_blank");
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

            {authError && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-6 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20"
              >
                Something went wrong with sign-in. Please try again.
              </motion.div>
            )}

            <motion.button
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.58 }}
              whileHover={{ y: -2, boxShadow: "var(--shadow-warm-lg)" }}
              whileTap={{ y: 0 }}
              onClick={handleGoogleSignIn}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-card border-2 border-border text-foreground font-medium text-lg animate-glow-breathe transition-shadow duration-300 max-w-sm w-full mx-auto md:mx-0"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
                <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                  <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                  <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                  <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                  <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                </g>
              </svg>
              Continue with Google
            </motion.button>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.75 }}
              className="mt-4 text-xs text-muted-foreground max-w-sm mx-auto md:mx-0"
            >
              Eleanor sends calendar invites so your traditions always have a home in your schedule.
            </motion.p>
          </div>

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
                { label: "Thursday Run Crew", status: "Blooming", weeks: "8 weeks growing" },
                { label: "Monthly Dinner", status: "Needs tending", weeks: "Just planted" },
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
