import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogOut, ChevronDown, Sprout, Users } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();

  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden">
      <header className="absolute top-0 left-0 right-0 z-10 px-6 md:px-8 py-6 md:py-8 flex justify-between items-center">
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
            <nav className="flex items-center gap-1">
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
                    onClick={() => presenceToggle.mutate(!user.showPresence)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                  >
                    <span>Show when I'm here {"\u{1F33F}"}</span>
                    <div className={`w-8 h-[18px] rounded-full transition-colors relative ${user.showPresence ? "bg-[#6B8F71]" : "bg-border"}`}>
                      <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform ${user.showPresence ? "left-[16px]" : "left-[2px]"}`} />
                    </div>
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors border-t border-border/30"
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

      <main className="flex-1 flex flex-col pt-24 pb-12 px-4 sm:px-6 md:px-8 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex-1 flex flex-col w-full h-full"
        >
          {children}
        </motion.div>
      </main>

    </div>
  );
}
