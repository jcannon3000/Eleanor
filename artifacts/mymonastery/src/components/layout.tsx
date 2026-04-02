import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { LogOut, ChevronDown, Sprout, Users, LayoutDashboard, Plus } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <header className="absolute top-0 w-full z-10 px-6 md:px-8 py-6 md:py-8 flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
              <Sprout size={20} strokeWidth={1.5} />
            </div>
            <span className="font-serif text-xl font-bold text-foreground group-hover:text-primary transition-colors" style={{ letterSpacing: "-0.025em" }}>
              Eleanor
            </span>
          </Link>

          {user && (
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/people"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  location.startsWith("/people")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                <Users size={14} />
                People
              </Link>
            </nav>
          )}
        </div>

        {user && (
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-card transition-colors focus:outline-none"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-8 h-8 rounded-full border-2 border-primary/20"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block text-sm font-medium text-foreground">{user.name}</span>
              <ChevronDown size={14} className="text-muted-foreground" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-card-border rounded-2xl shadow-[var(--shadow-warm-md)] z-20 overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/50">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pt-24 pb-24 sm:pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>

      {/* Mobile bottom nav */}
      {user && (
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-sm border-t border-card-border flex items-stretch">
          <Link
            href="/dashboard"
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
              location === "/dashboard" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <LayoutDashboard size={20} strokeWidth={1.5} />
            <span>Home</span>
          </Link>
          <Link
            href="/people"
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors ${
              location.startsWith("/people") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Users size={20} strokeWidth={1.5} />
            <span>People</span>
          </Link>
          <Link
            href="/tradition/new"
            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium text-muted-foreground transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center -mt-5 shadow-[var(--shadow-warm-md)] animate-glow-breathe">
              <Plus size={18} className="text-primary-foreground" />
            </div>
            <span className="mt-0.5">New</span>
          </Link>
        </nav>
      )}
    </div>
  );
}
