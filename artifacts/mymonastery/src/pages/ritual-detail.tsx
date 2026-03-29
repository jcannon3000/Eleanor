import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format, parseISO, formatDistanceToNow } from "date-fns";
import { Send, CheckCircle2, XCircle, ArrowLeft, MessageSquare, BookOpen, Settings, Sprout, Clock, Users } from "lucide-react";
import { clsx } from "clsx";
import {
  useGetRitual,
  useLogMeetup,
  useSendMessage,
  useUpdateRitual,
  useDeleteRitual,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { StreakBadge } from "@/components/StreakBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Tab = "eleanor" | "journal" | "settings";

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

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const logMutation = useLogMeetup();
  const deleteMutation = useDeleteRitual();
  const updateMutation = useUpdateRitual();
  const sendMessageMutation = useSendMessage();

  const [activeTab, setActiveTab] = useState<Tab>("eleanor");
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");

  interface ScheduleResponse {
    guestName: string;
    chosenTime: string | null;
    unavailable: boolean;
  }
  interface SchedulingData {
    proposedTimes: string[];
    confirmedTime: string | null;
    scheduleToken: string | null;
    responses: ScheduleResponse[];
  }
  const [schedulingData, setSchedulingData] = useState<SchedulingData | null>(null);

  useEffect(() => {
    if (ritual && !isEditing) {
      setEditName(ritual.name);
      setEditIntention(ritual.intention || "");
    }
  }, [ritual, isEditing]);

  useEffect(() => {
    if (!ritualId) return;
    fetch(`/api/rituals/${ritualId}/schedule-responses`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSchedulingData(data); })
      .catch(() => {});
  }, [ritualId]);

  useEffect(() => {
    if (activeTab === "eleanor") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [ritual?.messages, activeTab]);

  if (isLoading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-8 max-w-4xl mx-auto w-full pt-8">
          <div className="h-32 bg-card rounded-3xl" />
          <div className="h-[600px] bg-card rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (!ritual) return <Layout><div className="pt-20 text-center text-muted-foreground">Circle not found.</div></Layout>;

  const statusMeta = getStatusMeta(ritual.status);

  const handleLogMeetup = async (status: "completed" | "skipped") => {
    try {
      await logMutation.mutateAsync({
        id: ritualId,
        data: {
          status: status as "completed" | "skipped",
          scheduledDate: ritual.nextMeetupDate || new Date().toISOString()
        }
      });
      const msg = status === "completed"
        ? "Gathering logged. Your circle grows stronger."
        : "Noted — it happens. Eleanor will keep watch.";
      toast({ title: msg });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
    } catch {
      toast({ variant: "destructive", title: "Could not log gathering" });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const content = chatInput.trim();
    setChatInput("");
    try {
      await sendMessageMutation.mutateAsync({ id: ritualId, data: { content } });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch {
      toast({ variant: "destructive", title: "Message didn't send" });
      setChatInput(content);
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

  return (
    <Layout>
      <div className="max-w-4xl mx-auto w-full flex flex-col h-[calc(100vh-140px)]">

        {/* Circle Header */}
        <div className="bg-card rounded-3xl p-6 md:p-8 shadow-[var(--shadow-warm-sm)] border border-card-border mb-6 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className={`px-3 py-1 rounded-full text-xs font-medium border ${statusMeta.style}`}>
                  {statusMeta.label}
                </div>
                <StreakBadge count={ritual.streak} />
              </div>
              <h1 className="text-3xl md:text-4xl font-serif text-foreground">{ritual.name}</h1>
              <p className="text-muted-foreground mt-2 flex items-center gap-2 text-sm">
                <Sprout size={14} />
                <span className="capitalize">{ritual.frequency}</span>
                <span className="opacity-40">·</span>
                <span>{ritual.dayPreference}</span>
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="flex -space-x-3">
                {ritual.participants.map((p, i) => (
                  <Link
                    key={i}
                    href={`/people/${encodeURIComponent(p.email)}`}
                    className="w-10 h-10 rounded-full border-2 border-card bg-secondary flex items-center justify-center text-sm font-medium text-secondary-foreground shadow-sm relative group hover:z-10 hover:scale-110 hover:border-primary/40 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title={p.name}
                  >
                    {p.name.charAt(0).toUpperCase()}
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {p.name}
                    </div>
                  </Link>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleLogMeetup("skipped")}
                  disabled={logMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors"
                >
                  We missed one
                </button>
                <button
                  onClick={() => handleLogMeetup("completed")}
                  disabled={logMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-all"
                >
                  We gathered ✓
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scheduling Card — shown when confirmedTime is null and proposedTimes exist */}
        {schedulingData && !schedulingData.confirmedTime && schedulingData.proposedTimes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex-shrink-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 mb-3">
                <Clock size={16} className="text-amber-700" />
                <span className="text-sm font-semibold text-amber-800">Scheduling in progress</span>
              </div>
              <button
                onClick={() => setLocation(`/ritual/${ritualId}/schedule`)}
                className="text-xs px-3 py-1.5 bg-amber-800 text-amber-50 rounded-full font-medium hover:bg-amber-900 transition-colors"
              >
                Confirm time
              </button>
            </div>

            <div className="space-y-2 mb-3">
              {schedulingData.proposedTimes.map((t) => {
                const responsesForTime = schedulingData.responses.filter((r) => r.chosenTime === t);
                return (
                  <div key={t} className="flex items-center gap-3">
                    <span className="text-xs text-amber-700 w-48 shrink-0">
                      {format(parseISO(t), "EEE, MMM d 'at' h:mm a")}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Users size={12} className="text-amber-600" />
                      <span className="text-xs text-amber-700">
                        {responsesForTime.length > 0
                          ? responsesForTime.map((r) => r.guestName).join(", ")
                          : "No responses yet"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {schedulingData.responses.filter((r) => r.unavailable).length > 0 && (
              <p className="text-xs text-amber-700">
                Unavailable: {schedulingData.responses.filter((r) => r.unavailable).map((r) => r.guestName).join(", ")}
              </p>
            )}

            {schedulingData.scheduleToken && (
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-xs text-amber-700">
                  Guest link:{" "}
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/schedule/${schedulingData.scheduleToken}`;
                      navigator.clipboard.writeText(url);
                    }}
                    className="underline hover:no-underline font-medium"
                  >
                    Copy invite link
                  </button>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Confirmed time badge */}
        {schedulingData?.confirmedTime && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-6 flex-shrink-0 flex items-center gap-3">
            <CheckCircle2 size={16} className="text-green-700" />
            <div>
              <span className="text-sm font-semibold text-green-800">Time confirmed: </span>
              <span className="text-sm text-green-700">
                {format(parseISO(schedulingData.confirmedTime), "EEEE, MMMM d 'at' h:mm a")}
              </span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-card rounded-3xl shadow-[var(--shadow-warm-md)] border border-card-border flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-border/50 px-6 pt-2">
            {[
              { id: "eleanor", label: "Eleanor", icon: MessageSquare },
              { id: "journal", label: "Garden Journal", icon: BookOpen },
              { id: "settings", label: "Settings", icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={clsx(
                  "flex items-center gap-2 px-5 py-4 font-medium transition-colors border-b-2",
                  activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon size={15} />
                <span className="hidden sm:inline text-sm">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto relative">

            {/* Eleanor chat tab */}
            {activeTab === "eleanor" && (
              <div className="flex flex-col h-full bg-background/40">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {ritual.messages?.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <div className="max-w-sm space-y-4">
                        <div className="w-16 h-16 bg-primary/8 text-primary rounded-full flex items-center justify-center mx-auto">
                          <Sprout size={26} strokeWidth={1.5} />
                        </div>
                        <h3 className="font-serif text-xl">Eleanor is here</h3>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          Ask Eleanor to reschedule, propose new dates, check in with the circle, or help you keep this ritual growing.
                        </p>
                      </div>
                    </div>
                  )}
                  {ritual.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={clsx("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}
                    >
                      <span className="text-xs text-muted-foreground mb-1.5 px-2">
                        {msg.role === "user" ? "You" : "Eleanor"} · {format(parseISO(msg.createdAt), "h:mm a")}
                      </span>
                      <div className={clsx(
                        "px-5 py-3.5 rounded-2xl whitespace-pre-wrap leading-relaxed shadow-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-sm"
                          : "bg-card border border-border text-card-foreground rounded-tl-sm"
                      )}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-4 bg-card border-t border-border/50">
                  <form onSubmit={handleSendMessage} className="relative flex items-center">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask Eleanor to reschedule, check in, or coordinate..."
                      className="w-full pl-6 pr-14 py-4 rounded-full bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                      disabled={sendMessageMutation.isPending}
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || sendMessageMutation.isPending}
                      className="absolute right-2 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
                    >
                      <Send size={17} />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Garden Journal tab */}
            {activeTab === "journal" && (
              <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
                {(!ritual.meetups || ritual.meetups.length === 0) ? (
                  <div className="text-center py-12 space-y-3">
                    <Sprout size={32} strokeWidth={1} className="text-muted-foreground/40 mx-auto" />
                    <p className="text-muted-foreground">No gatherings recorded yet.</p>
                    <p className="text-sm text-muted-foreground/60">Your first entry will appear here after you gather.</p>
                  </div>
                ) : (
                  <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                    {ritual.meetups
                      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                      .map((meetup) => (
                        <div key={meetup.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                            {meetup.status === 'completed' ? (
                              <CheckCircle2 className="text-green-600" size={18} />
                            ) : meetup.status === 'skipped' ? (
                              <XCircle className="text-muted-foreground" size={18} />
                            ) : (
                              <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                            )}
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-background p-4 rounded-2xl border border-border shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">{format(parseISO(meetup.scheduledDate), "MMM d, yyyy")}</span>
                              <span className={clsx(
                                "text-xs px-2.5 py-0.5 rounded-full font-medium border",
                                meetup.status === 'completed' ? "bg-green-50 text-green-700 border-green-200" :
                                meetup.status === 'skipped' ? "bg-secondary text-muted-foreground border-border" :
                                "bg-orange-50 text-orange-700 border-orange-200"
                              )}>
                                {meetup.status === 'completed' ? 'Gathered' : meetup.status === 'skipped' ? 'Missed' : meetup.status}
                              </span>
                            </div>
                            {meetup.notes && <p className="text-sm text-muted-foreground mt-2">{meetup.notes}</p>}
                            <p className="text-xs text-muted-foreground/50 mt-2">{formatDistanceToNow(parseISO(meetup.createdAt), { addSuffix: true })}</p>
                          </div>
                        </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Settings tab */}
            {activeTab === "settings" && (
              <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-foreground">Circle Name</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
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
                        onChange={e => setEditIntention(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[100px]"
                      />
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-background border border-transparent min-h-[100px] whitespace-pre-wrap text-muted-foreground italic text-sm">
                        {ritual.intention || "No intention set yet."}
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-border flex justify-between items-center">
                    {isEditing ? (
                      <>
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                        <button
                          onClick={handleSaveSettings}
                          disabled={updateMutation.isPending}
                          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
                        >
                          Save Changes
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80"
                      >
                        Edit Details
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-16 pt-8 border-t border-destructive/20">
                  <h3 className="text-destructive font-medium mb-2">Archive this circle</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Deleting this circle will remove all its history and Eleanor's memory of it. This cannot be undone.
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to delete this circle?")) {
                        deleteMutation.mutate({ id: ritualId }, {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
                            setLocation("/dashboard");
                          }
                        });
                      }
                    }}
                    className="px-4 py-2 bg-destructive/10 text-destructive rounded-lg font-medium hover:bg-destructive hover:text-destructive-foreground transition-colors"
                  >
                    Delete Circle
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </Layout>
  );
}
