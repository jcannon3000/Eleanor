import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Sprout, ArrowRight } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePeople } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-primary/15 text-primary",
  "bg-accent/15 text-accent",
  "bg-green-100 text-green-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-sky-100 text-sky-700",
];

function colorFor(email: string) {
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function People() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { data: people, isLoading } = usePeople(user?.id);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading) return null;
  if (!user) return null;

  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
  };

  return (
    <Layout>
      <div className="flex flex-col h-full w-full">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif text-foreground tracking-tight">
              Your People
            </h1>
            <p className="mt-3 text-base text-muted-foreground italic">
              "The ones who keep showing up."
            </p>
          </div>
        </div>

        <div className="mb-10 h-px bg-border/60" />

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : !people || people.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center max-w-sm mx-auto py-16"
          >
            <div className="w-20 h-20 rounded-full bg-primary/8 border border-primary/15 flex items-center justify-center mb-6">
              <Sprout size={34} strokeWidth={1} className="text-primary/50" />
            </div>
            <h3 className="font-serif text-2xl text-foreground mb-3">No connections yet</h3>
            <p className="text-muted-foreground mb-8 leading-relaxed text-sm">
              People will appear here once you add them to a tradition. Plant your first ritual to start growing community.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium shadow-[var(--shadow-warm-md)] hover:shadow-[var(--shadow-warm-lg)] hover:-translate-y-0.5 transition-all"
            >
              <Sprout size={16} />
              Plant a Ritual
            </Link>
          </motion.div>
        ) : (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {people.map(person => (
              <motion.div key={person.email} variants={item}>
                <Link href={`/people/${encodeURIComponent(person.email)}`} className="block group focus:outline-none">
                  <div className="h-full bg-card rounded-2xl p-5 border border-card-border shadow-[var(--shadow-warm-sm)] hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-0.5 transition-all duration-300 flex items-start gap-4 group-focus-visible:ring-2 group-focus-visible:ring-primary">

                    {/* Avatar */}
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-semibold flex-shrink-0 ${colorFor(person.email)}`}>
                      {initials(person.name)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-lg text-foreground group-hover:text-primary transition-colors truncate">
                          {person.name}
                        </h3>
                        <div className="w-7 h-7 rounded-full bg-secondary group-hover:bg-primary flex items-center justify-center text-muted-foreground group-hover:text-primary-foreground transition-colors flex-shrink-0 mt-0.5">
                          <ArrowRight size={14} />
                        </div>
                      </div>

                      <div className="mt-1.5 space-y-1">
                        <p className="text-sm text-muted-foreground">
                          {person.sharedCircleCount === 1
                            ? "1 shared tradition"
                            : `${person.sharedCircleCount} shared traditions`}
                        </p>
                        <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Sprout size={11} />
                          Together {formatDistanceToNow(parseISO(person.firstCircleDate), { addSuffix: false })}
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </Layout>
  );
}
