import { useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sprout, CheckCircle2, XCircle, Calendar, Plus } from "lucide-react";
import { format, parseISO, formatDistanceToNow, differenceInWeeks } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { usePersonProfile } from "@/hooks/usePeople";
import { Layout } from "@/components/layout";
import { clsx } from "clsx";

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

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function getStatusStyle(status: string) {
  switch (status) {
    case "on_track":        return "bg-green-50 text-green-800 border-green-200";
    case "overdue":         return "bg-amber-50 text-amber-800 border-amber-200";
    default:                return "bg-secondary text-secondary-foreground border-secondary-border";
  }
}
function getStatusLabel(status: string) {
  switch (status) {
    case "on_track":        return "Blooming";
    case "overdue":         return "Needs tending";
    default:                return "Just planted";
  }
}

export default function PersonProfile() {
  const [, params] = useRoute("/people/:email");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const email = params?.email ? decodeURIComponent(params.email) : undefined;
  const { data: person, isLoading, isError } = usePersonProfile(email, user?.id);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading) return null;
  if (!user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto w-full pt-8 animate-pulse space-y-6">
          <div className="h-40 bg-card rounded-3xl" />
          <div className="h-64 bg-card rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (isError || !person) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto w-full pt-16 text-center">
          <Sprout size={36} className="text-muted-foreground/30 mx-auto mb-4" strokeWidth={1} />
          <h2 className="font-serif text-2xl mb-2">Person not found</h2>
          <p className="text-muted-foreground mb-6 text-sm">This person isn't in any of your traditions.</p>
          <Link href="/people" className="text-primary hover:underline text-sm">← Back to Your People</Link>
        </div>
      </Layout>
    );
  }

  const weeksTogetherCount = person.stats.firstCircleDate
    ? differenceInWeeks(new Date(), parseISO(person.stats.firstCircleDate))
    : 0;

  // Flatten all meetups across shared rituals, sorted newest first
  const allMeetups = person.sharedRituals
    .flatMap(({ ritual, meetups }) =>
      meetups.map(m => ({ ...m, ritualName: ritual.name, ritualId: ritual.id }))
    )
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full flex flex-col gap-6 pt-4">

        {/* Back */}
        <Link href="/people" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm w-fit">
          <ArrowLeft size={15} /> Back to Your People
        </Link>

        {/* Profile header card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-card rounded-3xl p-8 border border-card-border shadow-[var(--shadow-warm-sm)]"
        >
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-semibold flex-shrink-0 ${colorFor(person.email)}`}>
              {initials(person.name)}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-3xl text-foreground mb-1">{person.name}</h1>
              <p className="text-sm text-muted-foreground mb-4">{person.email}</p>

              <p className="text-xs text-muted-foreground mb-2">
                {person.stats.sharedCircleCount > 0 && `${person.stats.sharedCircleCount} tradition${person.stats.sharedCircleCount === 1 ? "" : "s"}`}
                {person.stats.sharedCircleCount > 0 && person.stats.sharedPracticesCount > 0 && " · "}
                {person.stats.sharedPracticesCount > 0 && `${person.stats.sharedPracticesCount} practice${person.stats.sharedPracticesCount === 1 ? "" : "s"}`}
              </p>
              {person.stats.firstCircleDate && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <Sprout size={13} />
                  In your garden since {format(parseISO(person.stats.firstCircleDate), "MMMM yyyy")}
                  {weeksTogetherCount > 0 && (
                    <span className="text-muted-foreground/60">· {weeksTogetherCount} weeks</span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              {
                value: person.stats.score,
                label: "done together",
                emoji: "🌿",
              },
              {
                value: person.stats.currentBestStreak > 0 ? person.stats.currentBestStreak : "—",
                label: "current streak",
                emoji: "🔥",
              },
              {
                value: person.stats.longestEverStreak > 0 ? person.stats.longestEverStreak : "—",
                label: "best ever",
                emoji: "⭐",
              },
            ].map(stat => (
              <div key={stat.label} className="text-center px-3 py-4 rounded-2xl bg-background border border-border/60">
                <p className="font-serif text-2xl text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.emoji} {stat.label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Shared Traditions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="bg-card rounded-3xl p-6 md:p-8 border border-card-border shadow-[var(--shadow-warm-sm)]"
        >
          <h2 className="font-serif text-xl text-foreground mb-5">Shared Traditions</h2>
          <div className="space-y-3">
            {person.sharedRituals.map(({ ritual }) => (
              <Link key={ritual.id} href={`/ritual/${ritual.id}`} className="block group">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border/60 hover:border-primary/40 hover:shadow-[var(--shadow-warm-sm)] transition-all group-hover:-translate-y-0.5 duration-200">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                      <Sprout size={16} strokeWidth={1.5} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{ritual.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{ritual.frequency} · {ritual.dayPreference ?? "flexible"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getStatusStyle(ritual.status)}`}>
                      {getStatusLabel(ritual.status)}
                    </span>
                    {ritual.streak >= 2 && (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                        {ritual.streak}w growing
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Shared Practices */}
        {person.sharedPractices && person.sharedPractices.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="bg-card rounded-3xl p-6 md:p-8 border border-card-border shadow-[var(--shadow-warm-sm)]"
          >
            <h2 className="font-serif text-xl text-foreground mb-5">Shared Practices</h2>
            <div className="space-y-3">
              {person.sharedPractices.map(practice => (
                <Link key={practice.id} href={`/moments/${practice.id}`} className="block group">
                  <div className="flex items-center justify-between p-4 rounded-2xl bg-background border border-border/60 hover:border-primary/40 hover:shadow-[var(--shadow-warm-sm)] transition-all group-hover:-translate-y-0.5 duration-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0">
                        <span className="text-base">🌸</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{practice.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{practice.frequency}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      {practice.currentStreak >= 1 && (
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                          🔥 {practice.currentStreak} streak
                        </span>
                      )}
                      {practice.totalBlooms >= 1 && (
                        <span className="text-xs text-pink-700 bg-pink-50 border border-pink-200 px-2.5 py-1 rounded-full font-medium">
                          🌸 {practice.totalBlooms}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* Shared gathering history */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-card rounded-3xl p-6 md:p-8 border border-card-border shadow-[var(--shadow-warm-sm)]"
        >
          <h2 className="font-serif text-xl text-foreground mb-5">History Together</h2>

          {allMeetups.length === 0 ? (
            <div className="text-center py-8">
              <Calendar size={28} strokeWidth={1} className="text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No gatherings logged yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Log your first gathering from the circle page.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {allMeetups.map(meetup => (
                <Link key={meetup.id} href={`/ritual/${meetup.ritualId}`} className="block group">
                  <div className="flex items-center gap-4 p-3.5 rounded-xl bg-background border border-border/50 hover:border-primary/30 transition-all">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      meetup.status === "completed" ? "bg-green-50" : "bg-secondary"
                    )}>
                      {meetup.status === "completed" ? (
                        <CheckCircle2 size={16} className="text-green-600" />
                      ) : meetup.status === "skipped" ? (
                        <XCircle size={16} className="text-muted-foreground" />
                      ) : (
                        <div className="w-2 h-2 rounded-full bg-border" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {meetup.ritualName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(meetup.scheduledDate), "MMMM d, yyyy")}
                        <span className="opacity-60 ml-1.5">
                          · {formatDistanceToNow(parseISO(meetup.scheduledDate), { addSuffix: true })}
                        </span>
                      </p>
                    </div>

                    <span className={clsx(
                      "text-xs px-2.5 py-0.5 rounded-full border font-medium flex-shrink-0",
                      meetup.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                      meetup.status === "skipped"   ? "bg-secondary text-muted-foreground border-border" :
                      "bg-orange-50 text-orange-700 border-orange-200"
                    )}>
                      {meetup.status === "completed" ? "Gathered" :
                       meetup.status === "skipped"   ? "Missed" : meetup.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Invite to something new */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href="/tradition/new"
            className="flex items-center justify-between w-full p-5 bg-card rounded-3xl border border-card-border shadow-[var(--shadow-warm-sm)] hover:border-primary/40 hover:shadow-[var(--shadow-warm-md)] transition-all group"
          >
            <div>
              <p className="font-medium text-foreground group-hover:text-primary transition-colors">Invite to something new</p>
              <p className="text-sm text-muted-foreground mt-0.5">Start a practice or tradition with {(person.name || "them").split(" ")[0]}</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
              <Plus size={16} className="text-primary group-hover:text-primary-foreground" />
            </div>
          </Link>
        </motion.div>

      </div>
    </Layout>
  );
}
