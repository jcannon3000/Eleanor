import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format, parseISO, formatDistanceToNow, isPast } from "date-fns";
import { CheckCircle2, XCircle, Settings, Sprout, CalendarCheck, RefreshCw, Flower2, Plus, UserPlus, X, Copy, Link2, Calendar } from "lucide-react";
import { clsx } from "clsx";
import {
  useGetRitual,
  useUpdateRitual,
  useDeleteRitual,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { StreakBadge } from "@/components/StreakBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";

type Tab = "timeline" | "moments" | "settings";

const LOGGING_ICONS: Record<string, string> = {
  photo: "📷",
  reflection: "✍️",
  both: "📷✍️",
  checkin: "✅",
};

const STATE_META: Record<string, { label: string; style: string }> = {
  active: { label: "Active", style: "bg-green-50 text-green-700 border-green-200" },
  needs_water: { label: "Needs tending", style: "bg-amber-50 text-amber-700 border-amber-200" },
  dormant: { label: "Dormant", style: "bg-secondary text-muted-foreground border-border" },
};

type SharedMoment = {
  id: number;
  name: string;
  intention: string;
  loggingType: string;
  reflectionPrompt: string | null;
  frequency: string;
  scheduledTime: string;
  goalDays: number;
  currentStreak: number;
  longestStreak: number;
  totalBlooms: number;
  state: string;
  momentToken: string;
  latestWindow: { status: string; windowDate: string } | null;
  todayPostCount: number;
  windowOpen: boolean;
};

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
    case "on_track":   return { label: "Blooming",      style: "bg-green-50 text-green-800 border-green-200" };
    case "overdue":    return { label: "Needs tending", style: "bg-amber-50 text-amber-800 border-amber-200" };
    default:           return { label: null,             style: "" };
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

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: SharedMoment[] }>({
    queryKey: [`/api/rituals/${ritualId}/moments`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}/moments`),
    enabled: activeTab === "moments" && !!ritualId,
  });
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [calendarSynced, setCalendarSynced] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const [rsvp, setRsvp] = useState<"going" | "not-going" | null>(null);

  // ── Invite sheet state ─────────────────────────────────────────────────────
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [inviteQueue, setInviteQueue] = useState<Array<{ name: string; email: string }>>([]);
  const [inviteConnections, setInviteConnections] = useState<Array<{ name: string; email: string }>>([]);
  const [invitedEmails, setInvitedEmails] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // ── Calendar sync state ────────────────────────────────────────────────────
  const [calSyncNotifs, setCalSyncNotifs] = useState<Array<{ name: string; email: string }>>([]);
  const [calSyncedEmails, setCalSyncedEmails] = useState<Set<string>>(new Set());
  const [declinedEmails, setDeclinedEmails] = useState<Set<string>>(new Set());

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

  // Load RSVP preference from localStorage when meetup changes
  useEffect(() => {
    if (timeline?.upcoming?.id) {
      const stored = localStorage.getItem(`rsvp-meetup-${timeline.upcoming.id}`);
      setRsvp((stored as "going" | "not-going" | null) ?? null);
    }
  }, [timeline?.upcoming?.id]);

  const handleRsvp = (choice: "going" | "not-going") => {
    if (!timeline?.upcoming?.id) return;
    localStorage.setItem(`rsvp-meetup-${timeline.upcoming.id}`, choice);
    setRsvp(choice);
  };

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
        ? "Gathering logged. Your tradition grows stronger. 🌱"
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

  // ── Calendar sync: run once on page load ──────────────────────────────────
  useEffect(() => {
    if (!ritualId) return;
    fetch(`/api/rituals/${ritualId}/calendar-sync`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { synced: Array<{ name: string; email: string }>; declinedEmails: string[] } | null) => {
        if (!data) return;
        if (data.synced.length > 0) {
          setCalSyncNotifs(data.synced);
          setCalSyncedEmails(new Set(data.synced.map(m => m.email.toLowerCase())));
          queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
          // Auto-dismiss after 5 seconds
          setTimeout(() => setCalSyncNotifs([]), 5000);
        }
        if (data.declinedEmails.length > 0) {
          setDeclinedEmails(new Set(data.declinedEmails));
        }
      })
      .catch(() => null);
  }, [ritualId]);

  // ── Invite sheet: fetch connections when opened ───────────────────────────
  useEffect(() => {
    if (!showInviteSheet || !ritualId) return;
    fetch(`/api/rituals/${ritualId}/connections`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { connections: Array<{ name: string; email: string }> } | null) => {
        if (data) setInviteConnections(data.connections);
      })
      .catch(() => null);
  }, [showInviteSheet, ritualId]);

  const joinLink = `${window.location.origin}/join/${(ritual as any)?.scheduleToken ?? ""}`;

  const handleAddEmailToQueue = () => {
    const email = inviteEmailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (inviteQueue.some(p => p.email.toLowerCase() === email.toLowerCase())) return;
    setInviteQueue(prev => [...prev, { name: email.split("@")[0], email }]);
    setInviteEmailInput("");
  };

  const handleRemoveFromQueue = (email: string) => {
    setInviteQueue(prev => prev.filter(p => p.email !== email));
  };

  const handleQuickInvite = async (name: string, email: string) => {
    if (invitedEmails.has(email.toLowerCase())) return;
    try {
      const res = await fetch(`/api/rituals/${ritualId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participants: [{ name, email }] }),
      });
      if (res.ok) {
        setInvitedEmails(prev => new Set([...prev, email.toLowerCase()]));
        queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      }
    } catch { /* ignore */ }
  };

  const handleSendInvites = async () => {
    const all = [...inviteQueue];
    if (all.length === 0) { setShowInviteSheet(false); return; }
    setInviting(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participants: all }),
      });
      if (res.ok) {
        const data: { added: Array<{ name: string; email: string }> } = await res.json();
        const newEmails = new Set(data.added.map(p => p.email.toLowerCase()));
        setInvitedEmails(prev => new Set([...prev, ...newEmails]));
        setInviteQueue([]);
        setShowInviteSheet(false);
        toast({ title: `${data.added.length} invitation${data.added.length !== 1 ? "s" : ""} sent 🌱` });
        queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      }
    } catch {
      toast({ variant: "destructive", title: "Could not send invitations" });
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
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

  if (!ritual) return <Layout><div className="pt-20 text-center text-muted-foreground">Tradition not found.</div></Layout>;

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
                {statusMeta.label && (
                  <div className={`px-3 py-1 rounded-full text-xs font-medium border ${statusMeta.style}`}>
                    {statusMeta.label}
                  </div>
                )}
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

            {/* Member avatars + Add people */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <div className="flex -space-x-2">
                {ritual.participants.slice(0, 3).map((p, i) => {
                  const isPending = invitedEmails.has(p.email.toLowerCase()) || false;
                  const isDeclined = declinedEmails.has(p.email.toLowerCase());
                  const isSynced = calSyncedEmails.has(p.email.toLowerCase());
                  return (
                    <div key={i} className="relative group/avatar">
                      <Link
                        href={`/people/${encodeURIComponent(p.email)}`}
                        className={clsx(
                          "w-9 h-9 rounded-full border-2 border-card flex items-center justify-center text-xs font-medium shadow-sm hover:z-10 hover:scale-110 transition-all",
                          isPending ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary"
                        )}
                        title={p.name}
                      >
                        {p.name.charAt(0).toUpperCase()}
                      </Link>
                      {isSynced && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-blue-500 border border-card flex items-center justify-center">
                          <Calendar size={8} className="text-white" />
                        </span>
                      )}
                      {isDeclined && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border border-card" title="May have declined" />
                      )}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-foreground text-background text-xs rounded-lg whitespace-nowrap opacity-0 group-hover/avatar:opacity-100 transition-opacity pointer-events-none z-20">
                        {p.name}
                      </div>
                    </div>
                  );
                })}
                {ritual.participants.length > 3 && (
                  <div className="w-9 h-9 rounded-full border-2 border-card bg-secondary flex items-center justify-center text-xs font-medium text-muted-foreground shadow-sm">
                    +{ritual.participants.length - 3}
                  </div>
                )}
              </div>
              <button
                onClick={() => setShowInviteSheet(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#6B8F71]/50 text-[#4a6b50] text-xs font-medium hover:bg-[#6B8F71]/10 transition-colors"
              >
                <UserPlus size={12} />
                Add people
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-secondary rounded-2xl mb-6">
          {[
            { id: "timeline", label: "📅 Timeline" },
            { id: "moments", label: "🌿 Moments" },
            { id: "settings", label: "⚙️ Settings" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={clsx(
                "flex-1 py-2.5 px-3 rounded-xl font-medium text-sm transition-all",
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
              {/* Calendar sync notifications */}
              <AnimatePresence>
                {calSyncNotifs.map((m, i) => (
                  <motion.div
                    key={m.email}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setCalSyncNotifs(prev => prev.filter(n => n.email !== m.email))}
                    className="flex items-center gap-3 bg-[#F0F8F0] border border-[#6B8F71]/30 rounded-2xl px-4 py-3 cursor-pointer"
                  >
                    <span className="text-xl">🌱</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#2a402c]">{m.name} was added from your calendar</p>
                      <p className="text-xs text-[#4a6b50]/70">They've been added to {ritual.name}.</p>
                    </div>
                    <X size={14} className="text-[#4a6b50]/50 flex-shrink-0" />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Upcoming gathering */}
              {timelineLoading ? (
                <div className="h-40 bg-card rounded-2xl border border-card-border animate-pulse" />
              ) : timeline?.upcoming ? (
                <div className={`bg-card rounded-2xl border p-6 shadow-[var(--shadow-warm-sm)] ${
                  timeline.confirmedTime ? "border-primary/30" : "border-card-border border-dashed"
                }`}>
                  {/* Card header — always includes Reschedule */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <CalendarCheck size={16} className={timeline.confirmedTime ? "text-primary" : "text-muted-foreground"} />
                      <span className={`text-sm font-semibold uppercase tracking-wide ${
                        timeline.confirmedTime ? "text-primary" : "text-muted-foreground"
                      }`}>
                        {timeline.confirmedTime ? "Next Gathering" : "Awaiting Responses"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {calendarSynced && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw size={11} />
                          Synced
                        </span>
                      )}
                      <Link
                        href={`/ritual/${ritualId}/schedule`}
                        className="text-xs font-medium text-primary/80 hover:text-primary border border-primary/30 rounded-full px-3 py-1 transition-colors"
                      >
                        Reschedule
                      </Link>
                    </div>
                  </div>

                  {/* Status badge */}
                  {timeline.confirmedTime ? (
                    <div className="flex items-center gap-2 mb-4">
                      {timeline.upcoming.googleCalendarEventId ? (
                        <a
                          href="https://calendar.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors"
                        >
                          <CheckCircle2 size={12} />
                          Confirmed in Google Calendar
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium">
                          <CheckCircle2 size={12} />
                          Time confirmed
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                        <RefreshCw size={11} />
                        Time will confirm when 2+ people agree
                      </span>
                    </div>
                  )}

                  {/* Date & time */}
                  <p className="text-2xl font-semibold text-foreground mb-1">
                    {format(parseISO(timeline.upcoming.scheduledDate), "EEEE, MMMM d")}
                  </p>
                  <p className="text-lg text-muted-foreground mb-4">
                    {format(parseISO(timeline.upcoming.scheduledDate), "h:mm a")}
                    {!upcomingIsPast && !timeline.confirmedTime && (
                      <span className="text-sm ml-2 text-muted-foreground/50 italic"> · pending</span>
                    )}
                    {!upcomingIsPast && timeline.confirmedTime && (
                      <span className="text-sm ml-2 text-muted-foreground/60">
                        · {formatDistanceToNow(parseISO(timeline.upcoming.scheduledDate), { addSuffix: true })}
                      </span>
                    )}
                  </p>

                  {/* Bottom action zone */}
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
                  ) : timeline.confirmedTime ? (
                    /* Fixed future event — RSVP */
                    <div className="pt-3 border-t border-border/50">
                      <p className="text-xs text-muted-foreground mb-2.5 font-medium">Will you be there?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRsvp("going")}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            rsvp === "going"
                              ? "bg-[#6B8F71] border-[#6B8F71] text-white shadow-sm"
                              : "border-border text-muted-foreground hover:border-[#6B8F71]/60 hover:text-[#6B8F71]"
                          }`}
                        >
                          I'll be there ✓
                        </button>
                        <button
                          onClick={() => handleRsvp("not-going")}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            rsvp === "not-going"
                              ? "bg-rose-50 border-rose-300 text-rose-700"
                              : "border-border text-muted-foreground hover:border-rose-300/60 hover:text-rose-500"
                          }`}
                        >
                          Can't make it
                        </button>
                      </div>
                      {rsvp && (
                        <p className="text-xs text-muted-foreground/60 text-center mt-2 italic">
                          {rsvp === "going" ? "Marked as attending 🌱" : "Noted — maybe next time."}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* Flexible pending event */
                    <div className="pt-2 border-t border-border/50 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground italic">
                        Waiting for tradition responses via invite links
                      </p>
                      <Link
                        href={`/ritual/${ritualId}/schedule`}
                        className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Change times →
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                /* No gathering scheduled yet */
                <div className="bg-card rounded-2xl border border-dashed border-border p-8 text-center">
                  <div className="w-12 h-12 bg-primary/8 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Sprout size={22} strokeWidth={1.5} className="text-primary/60" />
                  </div>
                  <p className="font-medium text-foreground mb-1">No gathering scheduled yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Set a time and Eleanor will send calendar invites to your tradition.
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

          {activeTab === "moments" && (
            <motion.div
              key="moments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Plant CTA */}
              <Link
                href={`/moment/new?ritualId=${ritualId}`}
                className="flex items-center justify-between p-5 bg-card rounded-2xl border border-card-border hover:border-primary/30 transition-colors group"
              >
                <div>
                  <p className="font-semibold text-foreground">Plant a Shared Moment</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A recurring micro-ritual your whole tradition shows up for together.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 ml-4 group-hover:bg-primary/20 transition-colors">
                  <Plus size={18} className="text-primary" />
                </div>
              </Link>

              {/* Streak rule note */}
              <p className="text-xs text-muted-foreground italic text-center px-4">
                The streak blooms when at least two of you practice together.
              </p>

              {/* Moments list */}
              {momentsLoading && (
                <div className="space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-32 bg-card rounded-2xl border border-card-border animate-pulse" />)}
                </div>
              )}

              {!momentsLoading && momentsData && momentsData.moments.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🌿</div>
                  <p className="font-medium text-foreground mb-1">No moments planted yet</p>
                  <p className="text-sm text-muted-foreground">Plant your first Shared Moment to start gathering together.</p>
                </div>
              )}

              {!momentsLoading && momentsData?.moments.map((m: SharedMoment) => {
                const stateMeta = STATE_META[m.state] ?? STATE_META.active;
                const loggingIcon = LOGGING_ICONS[m.loggingType] ?? "🌿";
                const [hh, mm] = m.scheduledTime.split(":").map(Number);
                const timeLabel = new Date(0, 0, 0, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                return (
                  <div key={m.id} className="bg-card rounded-2xl border border-card-border p-5 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-lg">{loggingIcon}</span>
                          <h3 className="font-semibold text-foreground">{m.name}</h3>
                          <span className={clsx("text-xs px-2 py-0.5 rounded-full border font-medium", stateMeta.style)}>
                            {stateMeta.label}
                          </span>
                          {m.windowOpen && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 font-medium animate-pulse">
                              Window open now
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-sage)] italic leading-relaxed line-clamp-2">{m.intention}</p>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <p className="text-2xl font-bold text-primary leading-none">{m.currentStreak}</p>
                        <p className="text-xs text-muted-foreground">streak</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{m.frequency} · {timeLabel}</span>
                      <span>{m.totalBlooms} bloom{m.totalBlooms !== 1 ? "s" : ""} · {m.goalDays}-day goal</span>
                    </div>

                    {m.windowOpen && (
                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {m.todayPostCount >= 2
                              ? `🌸 ${m.todayPostCount} showed up — this window counts`
                              : m.todayPostCount === 1
                              ? "🌿 1 person showed up — waiting for more"
                              : "No one has shown up yet today"}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
                <label className="block text-sm font-medium mb-2 text-foreground">Tradition Name</label>
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

              {user?.id === ritual.ownerId && (
                <div className="pt-8 border-t border-destructive/20">
                  <h3 className="text-destructive font-medium mb-2">Delete this tradition</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This will permanently remove all history and cannot be undone.
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this tradition? This cannot be undone.")) {
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
                    Delete tradition
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Invite bottom sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showInviteSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowInviteSheet(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-background rounded-t-3xl z-50 max-h-[85vh] overflow-y-auto"
            >
              <div className="px-6 pt-5 pb-8 max-w-lg mx-auto">
                {/* Handle */}
                <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">Invite to {ritual.name} 🌱</h2>
                  <button onClick={() => setShowInviteSheet(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <X size={16} />
                  </button>
                </div>

                {/* Section 1: Existing connections */}
                {inviteConnections.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Already in Eleanor with you</p>
                    <div className="space-y-2">
                      {inviteConnections.map(c => {
                        const already = ritual.participants.some(p => p.email.toLowerCase() === c.email.toLowerCase());
                        const justInvited = invitedEmails.has(c.email.toLowerCase());
                        return (
                          <div key={c.email} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary/50">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                            </div>
                            {already ? (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">Already here ✓</span>
                            ) : justInvited ? (
                              <span className="text-xs text-[#4a6b50] font-medium whitespace-nowrap">Invited ✓</span>
                            ) : (
                              <button
                                onClick={() => handleQuickInvite(c.name, c.email)}
                                className="text-xs font-medium text-[#4a6b50] border border-[#6B8F71]/50 rounded-full px-3 py-1 hover:bg-[#6B8F71]/10 transition-colors whitespace-nowrap"
                              >
                                Invite →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 2: Email invite */}
                <div className="mb-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invite someone new</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmailInput}
                      onChange={e => setInviteEmailInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddEmailToQueue()}
                      placeholder="name@example.com"
                      className="flex-1 px-4 py-2.5 rounded-2xl border border-border focus:border-[#6B8F71] outline-none bg-secondary/30 text-sm"
                    />
                    <button
                      onClick={handleAddEmailToQueue}
                      className="px-4 py-2.5 rounded-2xl bg-[#6B8F71] text-white text-sm font-medium hover:bg-[#5a7a60] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {inviteQueue.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {inviteQueue.map(p => (
                        <span key={p.email} className="flex items-center gap-1.5 px-3 py-1 bg-[#6B8F71]/10 border border-[#6B8F71]/30 rounded-full text-sm text-[#4a6b50]">
                          {p.email}
                          <button onClick={() => handleRemoveFromQueue(p.email)} className="text-[#4a6b50]/50 hover:text-[#4a6b50]">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Share link */}
                <div className="mb-8">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Or share a link</p>
                  <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-2xl">
                    <Link2 size={14} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground truncate flex-1">{joinLink}</span>
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
                    >
                      <Copy size={12} />
                      {copiedLink ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Send invites button */}
                <button
                  onClick={handleSendInvites}
                  disabled={inviting || inviteQueue.length === 0}
                  className="w-full py-4 bg-[#6B8F71] text-white rounded-2xl font-semibold text-base hover:bg-[#5a7a60] transition-all disabled:opacity-50"
                >
                  {inviting ? "Sending…" : `Send invites 🌱${inviteQueue.length > 0 ? ` (${inviteQueue.length})` : ""}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}
