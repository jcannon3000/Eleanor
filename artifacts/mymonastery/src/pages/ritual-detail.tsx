import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format, parseISO, formatDistanceToNow, isPast } from "date-fns";
import { CheckCircle2, XCircle, Settings, Sprout, CalendarCheck, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import {
  useGetRitual,
  useUpdateRitual,
  useDeleteRitual,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { StreakBadge } from "@/components/StreakBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "timeline" | "settings";

interface TimelineMeetup {
  id: number;
  scheduledDate: string;
  status: string;
  googleCalendarEventId: string | null;
  notes: string | null;
}

interface TimelineData {
  upcoming: TimelineMeetup | null;
  past: TimelineMeetup[];
  location: string | null;
  confirmedTime: string | null;
}

function getStatusMeta(status: string) {
  switch (status) {
    case "on_track":   return { label: "Blooming",        style: "bg-green-50 text-green-800 border-green-200" };
    case "overdue":    return { label: "Needs tending",   style: "bg-amber-50 text-amber-800 border-amber-200" };
    default:           return { label: "Ready to plant",  style: "bg-secondary text-secondary-foreground border-secondary-border" };
  }
}

export default function RitualDetail() {
  const [, params] = useRoute("/ritual/:id");
  const [, setLocation] = useLocation();
  const ritualId = parseInt(params?.id || "0", 10);
  const { data: ritual, isLoading } = useGetRitual(ritualId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const deleteMutation = useDeleteRitual();
  const updateMutation = useUpdateRitual();

  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [calendarSynced, setCalendarSynced] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (ritual && !isEditing) {
      setEditName(ritual.name);
      setEditIntention(ritual.intention || "");
    }
  }, [ritual, isEditing]);

  const fetchTimeline = useCallback(async () => {
    if (!ritualId) return;
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/timeline`, { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data: TimelineData = await res.json();
        const prevDate = timeline?.upcoming?.scheduledDate;
        const newDate = data.upcoming?.scheduledDate;
        if (prevDate && newDate && prevDate !== newDate) setCalendarSynced(true);
        setTimeline(data);
      }
    } catch {
      toast({ variant: "destructive", title: "Could not load timeline" });
    } finally {
      setTimelineLoading(false);
    }
  }, [ritualId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const handleLog = async (meetupId: number, status: "completed" | "skipped") => {
    setLoggingId(meetupId);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/meetups/${meetupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to log");
      const msg = status === "completed"
        ? "Gathering logged. Your circle grows stronger. 🌱"
        : "Noted — it happens. Eleanor will keep watch.";
      toast({ title: msg });
      await fetchTimeline();
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
    } catch {
      toast({ variant: "destructive", title: "Could not log gathering" });
    } finally {
      setLoggingId(null);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateMutation.mutateAsync({ id: ritualId, data: { name: editName, intention: editIntention } });
      setIsEditing(false);
      toast({ title: "Changes saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch {
      toast({ variant: "destructive", title: "Could not save changes" });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-6 max-w-3xl mx-auto w-full pt-8">
          <div className="h-36 bg-card rounded-3xl" />
          <div className="h-64 bg-card rounded-3xl" />
          <div className="h-48 bg-card rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (!ritual) return <Layout><div className="pt-20 text-center text-muted-foreground">Circle not found.</div></Layout>;

  const statusMeta = getStatusMeta(ritual.status);
  const upcomingDate = timeline?.upcoming ? new Date(timeline.upcoming.scheduledDate) : null;
  const upcomingIsPast = upcomingDate ? isPast(upcomingDate) : false;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full pb-16">

        {/* Header */}
        <div className="bg-card rounded-3xl p-6 md:p-8 shadow-[var(--shadow-warm-sm)] border border-card-border mb-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <div className={`px-3 py-1 rounded-full text-xs font-medium border ${statusMeta.style}`}>
                  {statusMeta.label}
                </div>
                <StreakBadge count={ritual.streak} />
              </div>
              <h1 className="text-3xl md:text-4xl font-serif text-foreground truncate">{ritual.name}</h1>
              <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm flex-wrap">
                <Sprout size={14} />
                <span className="capitalize">{ritual.frequency}</span>
                {ritual.dayPreference && (
                  <><span className="opacity-40">·</span><span>{ritual.dayPreference}</span></>
                )}
                {timeline?.location && (
                  <><span className="opacity-40">·</span><span>📍 {timeline.location}</span></>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex -space-x-2">
                {ritual.participants.slice(0, 5).map((p, i) => (
                  <Link
                    key={i}
                    href={`/people/${encodeURIComponent(p.email)}`}
                    className="w-9 h-9 rounded-full border-2 border-card bg-primary/10 flex items-center justify-center text-xs font-medium text-primary shadow-sm hover:z-10 hover:scale-110 transition-all"
                    title={p.name}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </Link>
                ))}
              </div>
              <button
                onClick={() => setActiveTab("settings")}
                className={clsx(
                  "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                  activeTab === "settings"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
                title="Settings"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-6">
          {[
            { id: "timeline", label: "📅 Timeline" },
            { id: "settings", label: "⚙️ Settings" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={clsx(
                "flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all",
                activeTab === tab.id
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "timeline" && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* Upcoming gathering */}
              {timelineLoading ? (
                <div className="h-40 bg-card rounded-2xl border border-card-border animate-pulse" />
              ) : timeline?.upcoming ? (
                <div className="bg-card rounded-2xl border border-card-border p-6 shadow-[var(--shadow-warm-sm)]">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CalendarCheck size={16} className="text-primary" />
                      <span className="text-sm font-semibold text-primary uppercase tracking-wide">Next Gathering</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {calendarSynced && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw size={11} />
                          Synced from Google Calendar
                        </span>
                      )}
                      <Link
                        href={`/ritual/${ritualId}/schedule`}
                        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors"
                      >
                        Reschedule
                      </Link>
                    </div>
                  </div>

                  {timeline.upcoming.googleCalendarEventId && (
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                    >
                      <CheckCircle2 size={12} />
                      Added to Google Calendar
                    </a>
                  )}

                  <p className="text-2xl font-semibold text-foreground mb-1">
                    {format(parseISO(timeline.upcoming.scheduledDate), "EEEE, MMMM d")}
                  </p>
                  <p className="text-lg text-muted-foreground mb-4">
                    {format(parseISO(timeline.upcoming.scheduledDate), "h:mm a")}
                    {!upcomingIsPast && (
                      <span className="text-sm ml-2 text-muted-foreground/60">
                        · {formatDistanceToNow(parseISO(timeline.upcoming.scheduledDate), { addSuffix: true })}
                      </span>
                    )}
                  </p>

                  {upcomingIsPast ? (
                    <div className="flex gap-3 pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleLog(timeline.upcoming!.id, "skipped")}
                        disabled={loggingId !== null}
                        className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
                      >
                        We missed this one 🌿
                      </button>
                      <button
                        onClick={() => handleLog(timeline.upcoming!.id, "completed")}
                        disabled={loggingId !== null}
                        className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
                      >
                        {loggingId ? "Logging..." : "We gathered ✓"}
                      </button>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-xs text-muted-foreground text-center italic">
                        Come back after your gathering to log it 🌱
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* No confirmed gathering yet */
                <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center">
                  <div className="w-12 h-12 bg-primary/8 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Sprout size={22} strokeWidth={1.5} className="text-primary/60" />
                  </div>
                  <p className="font-medium text-foreground mb-1">No gathering scheduled yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set a time and Eleanor will send calendar invites to your circle.
                  </p>
                  <Link
                    href={`/ritual/${ritualId}/schedule`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-full text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Schedule a gathering 🗓️
                  </Link>
                </div>
              )}

              {/* Past gatherings */}
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  Past Gatherings
                </h2>
                {(!timeline || timeline.past.length === 0) ? (
                  <div className="text-center py-10 text-muted-foreground/50 space-y-2">
                    <p className="text-sm">No past gatherings yet.</p>
                    <p className="text-xs">Your history will appear here after you log a gathering.</p>
                  </div>
                ) : (
                  <div className="relative space-y-4">
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-border to-transparent" />
                    {timeline.past.map((meetup) => (
                      <div key={meetup.id} className="flex items-start gap-4 pl-1">
                        <div className="relative z-10 w-8 h-8 rounded-full border-2 border-card bg-background flex items-center justify-center flex-shrink-0 shadow-sm">
                          {meetup.status === "completed" ? (
                            <CheckCircle2 size={16} className="text-green-600" />
                          ) : (
                            <XCircle size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 bg-background border border-border rounded-2xl p-4 min-w-0">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="font-medium text-sm text-foreground">
                              {format(parseISO(meetup.scheduledDate), "EEEE, MMMM d, yyyy")}
                            </span>
                            <span className={clsx(
                              "text-xs px-2.5 py-0.5 rounded-full font-medium border",
                              meetup.status === "completed"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-secondary text-muted-foreground border-border"
                            )}>
                              {meetup.status === "completed" ? "Gathered" : "Missed"}
                            </span>
                          </div>
                          {meetup.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{meetup.notes}</p>
                          )}
                          <p className="text-xs text-muted-foreground/50 mt-1">
                            {format(parseISO(meetup.scheduledDate), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="bg-card rounded-2xl border border-card-border p-6 space-y-6"
            >
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">Circle Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-background border border-transparent text-foreground">{ritual.name}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">Intention</label>
                {isEditing ? (
                  <textarea
                    value={editIntention}
                    onChange={(e) => setEditIntention(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[100px] bg-background"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-background border border-transparent min-h-[100px] whitespace-pre-wrap text-muted-foreground italic text-sm">
                    {ritual.intention || "No intention set yet."}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
                  >
                    Edit Details
                  </button>
                )}
              </div>

              <div className="pt-8 border-t border-destructive/20">
                <h3 className="text-destructive font-medium mb-2">Archive this circle</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This will permanently remove all history and cannot be undone.
                </p>
                <button
                  onClick={() => {
                    if (window.confirm("Are you sure you want to archive this circle?")) {
                      deleteMutation.mutate({ id: ritualId }, {
                        onSuccess: () => {
                          queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
                          setLocation("/dashboard");
                        }
                      });
                    }
                  }}
                  className="px-4 py-2 bg-destructive/10 text-destructive rounded-xl font-medium hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  Archive circle
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
