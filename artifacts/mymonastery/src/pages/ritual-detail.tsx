import { useState, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { Send, CheckCircle2, XCircle, ArrowLeft, MoreVertical, Coffee, MessageSquare, History, Settings } from "lucide-react";
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
import { getLocalUser } from "@/lib/user";

type Tab = "coordinate" | "history" | "settings";

export default function RitualDetail() {
  const [, params] = useRoute("/ritual/:id");
  const [, setLocation] = useLocation();
  const ritualId = parseInt(params?.id || "0", 10);
  const { data: ritual, isLoading } = useGetRitual(ritualId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const user = getLocalUser();

  useEffect(() => {
    if (!user) setLocation("/");
  }, [user, setLocation]);

  const logMutation = useLogMeetup();
  const deleteMutation = useDeleteRitual();
  const updateMutation = useUpdateRitual();
  const sendMessageMutation = useSendMessage();

  const [activeTab, setActiveTab] = useState<Tab>("coordinate");
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Settings state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");

  useEffect(() => {
    if (ritual && !isEditing) {
      setEditName(ritual.name);
      setEditIntention(ritual.intention || "");
    }
  }, [ritual, isEditing]);

  useEffect(() => {
    if (activeTab === "coordinate") {
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

  if (!ritual) return <Layout><div className="pt-20 text-center">Ritual not found</div></Layout>;

  const handleLogMeetup = async (status: "completed" | "skipped") => {
    try {
      await logMutation.mutateAsync({
        id: ritualId,
        data: {
          status: status as "completed" | "skipped",
          scheduledDate: ritual.nextMeetupDate || new Date().toISOString()
        }
      });
      toast({ title: `Meetup ${status}`, description: "The timeline has been updated." });
      // Invalidate both the ritual detail and the dashboard list
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to log meetup" });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const content = chatInput.trim();
    setChatInput("");
    
    // Optimistic UI could go here, but for simplicity we rely on cache invalidation
    try {
      await sendMessageMutation.mutateAsync({
        id: ritualId,
        data: { content }
      });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch (e) {
      toast({ variant: "destructive", title: "Message failed to send" });
      setChatInput(content); // restore input
    }
  };

  const handleSaveSettings = async () => {
    try {
      await updateMutation.mutateAsync({
        id: ritualId,
        data: { name: editName, intention: editIntention }
      });
      setIsEditing(false);
      toast({ title: "Settings saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch (e) {
      toast({ variant: "destructive", title: "Failed to save settings" });
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto w-full flex flex-col h-[calc(100vh-140px)]">
        
        {/* Header Header */}
        <div className="bg-card rounded-3xl p-6 md:p-8 shadow-[var(--shadow-warm-sm)] border border-card-border mb-6 flex-shrink-0">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                  ritual.status === 'on_track' ? 'bg-green-100 text-green-800 border-green-200' :
                  ritual.status === 'overdue' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                  'bg-yellow-100 text-yellow-800 border-yellow-200'
                }`}>
                  {ritual.status.replace('_', ' ')}
                </div>
                <StreakBadge count={ritual.streak} />
              </div>
              <h1 className="text-3xl md:text-4xl font-serif text-foreground">{ritual.name}</h1>
              <p className="text-muted-foreground mt-2 flex items-center gap-2">
                <Coffee size={16} /> {ritual.frequency} • {ritual.dayPreference}
              </p>
            </div>

            <div className="flex flex-col items-start md:items-end gap-3">
              <div className="flex -space-x-3">
                {ritual.participants.map((p, i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-card bg-secondary flex items-center justify-center text-sm font-medium text-secondary-foreground shadow-sm relative group" title={p.name}>
                    {p.name.charAt(0).toUpperCase()}
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                      {p.name}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleLogMeetup("skipped")}
                  disabled={logMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-lg transition-colors"
                >
                  Skip
                </button>
                <button 
                  onClick={() => handleLogMeetup("completed")}
                  disabled={logMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-all"
                >
                  Log Meetup
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-card rounded-3xl shadow-[var(--shadow-warm-md)] border border-card-border flex-1 flex flex-col min-h-0 overflow-hidden">
          
          {/* Tabs */}
          <div className="flex border-b border-border/50 px-6 pt-2">
            {[
              { id: "coordinate", label: "Coordinate", icon: MessageSquare },
              { id: "history", label: "History", icon: History },
              { id: "settings", label: "Settings", icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={clsx(
                  "flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2",
                  activeTab === tab.id 
                    ? "border-primary text-primary" 
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <tab.icon size={16} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto relative">
            
            {activeTab === "coordinate" && (
              <div className="flex flex-col h-full bg-background/50">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {ritual.messages?.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center px-4">
                      <div className="max-w-sm space-y-4">
                        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-2">
                          <MessageSquare size={24} />
                        </div>
                        <h3 className="font-serif text-xl">The Coordinator is ready</h3>
                        <p className="text-muted-foreground text-sm">
                          I am here to help manage scheduling, reminders, and streaks. Ask me to reschedule, propose new dates, or check in on the group.
                        </p>
                      </div>
                    </div>
                  )}
                  {ritual.messages?.map((msg) => (
                    <div key={msg.id} className={clsx("flex flex-col max-w-[85%]", msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start")}>
                      <span className="text-xs text-muted-foreground mb-1.5 px-2">
                        {msg.role === "user" ? "You" : "Coordinator"} • {format(parseISO(msg.createdAt), "h:mm a")}
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
                      placeholder="Ask the coordinator to reschedule, check in..."
                      className="w-full pl-6 pr-14 py-4 rounded-full bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                      disabled={sendMessageMutation.isPending}
                    />
                    <button 
                      type="submit"
                      disabled={!chatInput.trim() || sendMessageMutation.isPending}
                      className="absolute right-2 w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
                {(!ritual.meetups || ritual.meetups.length === 0) ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No meetups logged yet. Have your first gathering!
                  </div>
                ) : (
                  <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                    {ritual.meetups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((meetup) => (
                      <div key={meetup.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                          {meetup.status === 'completed' ? (
                            <CheckCircle2 className="text-primary" size={20} />
                          ) : meetup.status === 'skipped' ? (
                            <XCircle className="text-muted-foreground" size={20} />
                          ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                          )}
                        </div>
                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-background p-4 rounded-2xl border border-border shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{format(parseISO(meetup.scheduledDate), "MMM d, yyyy")}</span>
                            <span className={clsx(
                              "text-xs px-2 py-0.5 rounded-full font-medium capitalize border",
                              meetup.status === 'completed' ? "bg-green-50 text-green-700 border-green-200" :
                              meetup.status === 'skipped' ? "bg-secondary text-muted-foreground border-border" :
                              "bg-orange-50 text-orange-700 border-orange-200"
                            )}>
                              {meetup.status}
                            </span>
                          </div>
                          {meetup.notes && <p className="text-sm text-muted-foreground mt-2">{meetup.notes}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "settings" && (
              <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Ritual Name</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                      />
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-background border border-transparent">{ritual.name}</div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Intention</label>
                    {isEditing ? (
                      <textarea 
                        value={editIntention}
                        onChange={e => setEditIntention(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[100px]"
                      />
                    ) : (
                      <div className="px-4 py-3 rounded-xl bg-background border border-transparent min-h-[100px] whitespace-pre-wrap text-muted-foreground">
                        {ritual.intention || "No intention set."}
                      </div>
                    )}
                  </div>

                  <div className="pt-6 border-t border-border flex justify-between items-center">
                    {isEditing ? (
                      <>
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground">Cancel</button>
                        <button onClick={handleSaveSettings} disabled={updateMutation.isPending} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium">Save Changes</button>
                      </>
                    ) : (
                      <button onClick={() => setIsEditing(true)} className="px-6 py-2 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80">Edit Details</button>
                    )}
                  </div>
                </div>

                <div className="mt-16 pt-8 border-t border-destructive/20">
                  <h3 className="text-destructive font-medium mb-2">Danger Zone</h3>
                  <p className="text-sm text-muted-foreground mb-4">Deleting this ritual will remove all history and chat logs forever.</p>
                  <button 
                    onClick={() => {
                      if(window.confirm("Are you sure you want to delete this ritual?")) {
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
                    Delete Ritual
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
