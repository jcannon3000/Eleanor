import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
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
    // Break out of the Replit preview iframe so Google OAuth isn't blocked
    const target = window.top ?? window;
    target.location.href = `${window.location.origin}/api/auth/google`;
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
      <header className="absolute top-0 w-full z-10 p-6 md:p-8 flex items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 22 16 8" /><path d="M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
              <path d="M7.47 8.53 9 7l1.53 1.53a3.5 3.5 0 0 1 0 4.94L9 15l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
              <path d="M11.47 4.53 13 3l1.53 1.53a3.5 3.5 0 0 1 0 4.94L13 11l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z" />
            </svg>
          </div>
          <span className="font-serif text-xl tracking-tight text-foreground">MyMonastery</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 md:px-8 pt-24 pb-12">
        <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 lg:gap-24 max-w-5xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="flex-1 text-center md:text-left"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium mb-6">
              <Sparkles size={14} />
              <span>Welcome to the village</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-serif text-foreground leading-tight mb-6">
              Maintain your most <br />
              <span className="text-primary italic">sacred rituals</span>.
            </h1>

            <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto md:mx-0 leading-relaxed">
              MyMonastery helps you hold space for the people who matter. An AI coordinator
              manages scheduling, reminders, and streak tracking — so you can focus on the
              connection.
            </p>

            {authError && (
              <div className="mb-6 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm border border-destructive/20">
                Sign-in failed. Please try again.
              </div>
            )}

            <button
              onClick={handleGoogleSignIn}
              className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-card border-2 border-border text-foreground font-medium text-lg shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 max-w-sm w-full mx-auto md:mx-0"
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
            </button>

            <p className="mt-4 text-xs text-muted-foreground max-w-sm mx-auto md:mx-0">
              We request Google Calendar access so the AI coordinator can add ritual meetups
              to your calendar automatically.
            </p>
          </motion.div>

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
                alt="Abstract connection art"
                className="w-full h-full object-cover"
              />
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
