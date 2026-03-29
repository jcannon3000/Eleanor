import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Loader2, Sprout, ArrowLeft, CalendarClock, Plus, X } from "lucide-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToISO(value: string): string {
  return new Date(value).toISOString();
}

const SLOT_LABELS = [
  { label: "Your top pick", sublabel: "The time that works best for you", required: true },
  { label: "First backup", sublabel: "An alternative if guests can't make your top pick", required: false },
  { label: "Second backup", sublabel: "Another option for maximum flexibility", required: false },
];

export default function RitualSchedule() {
  const [, params] = useRoute("/ritual/:id/schedule");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const ritualId = parseInt(params?.id || "0", 10);

  const [ritualName, setRitualName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [times, setTimes] = useState<string[]>(["", "", ""]);
  const [shownSlots, setShownSlots] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!ritualId) return;
    async function load() {
      setIsLoading(true);
      try {
        const [ritualRes, timesRes] = await Promise.all([
          fetch(`/api/rituals/${ritualId}`, { credentials: "include" }),
          fetch(`/api/rituals/${ritualId}/suggested-times`, { credentials: "include" }),
        ]);
        if (ritualRes.ok) {
          const ritual = await ritualRes.json();
          setRitualName(ritual.name);
        }
        if (timesRes.ok) {
          const data = await timesRes.json();
          const proposed: string[] = data.proposedTimes ?? [];
          const filled = proposed.map((t: string) => isoToLocalInput(t));
          setTimes([filled[0] || "", filled[1] || "", filled[2] || ""]);
          const visibleCount = Math.max(1, proposed.length);
          setShownSlots(visibleCount);
        }
      } catch {
        toast({ variant: "destructive", title: "Could not load schedule" });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ritualId, toast]);

  const handleSave = async () => {
    const validTimes = times
      .slice(0, shownSlots)
      .filter((t) => t.length > 0)
      .map(localInputToISO);

    if (validTimes.length === 0) {
      toast({ variant: "destructive", title: "Pick at least one time to continue" });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/proposed-times`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proposedTimes: validTimes }),
      });
      if (!res.ok) throw new Error("Failed to save times");
      toast({
        title: "Times saved",
        description: "Eleanor will share these options with your circle.",
      });
      setLocation(`/ritual/${ritualId}`);
    } catch {
      toast({ variant: "destructive", title: "Could not save times" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/8 text-primary flex items-center justify-center mx-auto">
            <CalendarClock size={26} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <p className="text-muted-foreground text-lg">Preparing your schedule...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full pt-8 pb-16">
        <button
          onClick={() => setLocation(`/ritual/${ritualId}`)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Back to {ritualName || "circle"}
        </button>

        <div className="mb-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Set gathering times</p>
          <h1 className="text-3xl font-serif text-foreground mb-3">When can you gather?</h1>
          <p className="text-muted-foreground leading-relaxed">
            Pick the time that works best for you. Adding backup options means your circle has flexibility — more people can make it when there's more than one choice.
          </p>
        </div>

        <div className="space-y-4 mb-6">
          {Array.from({ length: shownSlots }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.06 }}
              className="bg-card border border-border rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-medium text-foreground">{SLOT_LABELS[i].label}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{SLOT_LABELS[i].sublabel}</p>
                </div>
                {i > 0 && (
                  <button
                    onClick={() => {
                      const next = [...times];
                      next[i] = "";
                      setTimes(next);
                      setShownSlots(i);
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors mt-0.5 flex-shrink-0"
                    aria-label="Remove this option"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
              <input
                type="datetime-local"
                value={times[i]}
                onChange={(e) => {
                  const next = [...times];
                  next[i] = e.target.value;
                  setTimes(next);
                }}
                className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm"
              />
            </motion.div>
          ))}
        </div>

        {shownSlots < 3 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => setShownSlots((s) => Math.min(s + 1, 3))}
            className="w-full py-3 border-2 border-dashed border-border rounded-2xl text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-2 text-sm font-medium mb-8"
          >
            <Plus size={16} />
            Add {shownSlots === 1 ? "a backup" : "another backup"} time
          </motion.button>
        )}

        {shownSlots === 3 && <div className="mb-8" />}

        <button
          onClick={handleSave}
          disabled={isSaving || !times[0]}
          className="w-full py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg hover:bg-primary/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.2)] flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Loader2 size={20} className="animate-spin" /> Saving...</>
          ) : (
            <><Sprout size={20} /> Save gathering times</>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Eleanor will use these times when she reaches out to your circle.
        </p>
      </div>
    </Layout>
  );
}
