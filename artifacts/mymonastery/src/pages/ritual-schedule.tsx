import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { format, parseISO } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Sprout, ArrowLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface ProposedTime {
  iso: string;
  label: string;
}

function parseProposedTimes(times: string[]): ProposedTime[] {
  return times.map((t) => {
    const d = parseISO(t);
    return {
      iso: t,
      label: format(d, "EEEE, MMMM d 'at' h:mm a"),
    };
  });
}

export default function RitualSchedule() {
  const [, params] = useRoute("/ritual/:id/schedule");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const ritualId = parseInt(params?.id || "0", 10);

  const [proposedTimes, setProposedTimes] = useState<ProposedTime[]>([]);
  const [ritualName, setRitualName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

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
          setProposedTimes(parseProposedTimes(data.proposedTimes ?? []));
        }
      } catch {
        toast({ variant: "destructive", title: "Could not load schedule" });
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [ritualId, toast]);

  const handleConfirm = async () => {
    if (!selectedTime) return;
    setIsConfirming(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/confirm-time`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmedTime: selectedTime }),
      });
      if (!res.ok) throw new Error("Failed to confirm time");
      toast({
        title: "Time confirmed",
        description: "Your circle is set. Eleanor will take it from here.",
      });
      setLocation(`/ritual/${ritualId}`);
    } catch {
      toast({ variant: "destructive", title: "Could not confirm time" });
    } finally {
      setIsConfirming(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/8 text-primary flex items-center justify-center mx-auto">
            <Sprout size={26} strokeWidth={1.5} className="animate-pulse" />
          </div>
          <p className="text-muted-foreground text-lg">Eleanor is reading your calendar...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-8">
        <button
          onClick={() => setLocation(`/ritual/${ritualId}`)}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-8 transition-colors"
        >
          <ArrowLeft size={16} /> Back to {ritualName || "circle"}
        </button>

        <div className="mb-10">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Eleanor's Suggestion</p>
          <h1 className="text-3xl font-serif text-foreground mb-2">Choose a time to gather</h1>
          <p className="text-muted-foreground">Here's a good time to help this ritual take root. Select one to confirm.</p>
        </div>

        <AnimatePresence>
          <div className="space-y-4 mb-10">
            {proposedTimes.map((pt, i) => {
              const isSelected = selectedTime === pt.iso;
              return (
                <motion.button
                  key={pt.iso}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  onClick={() => setSelectedTime(pt.iso)}
                  className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-center justify-between gap-4 ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  <div>
                    <p className={`font-medium text-lg ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {pt.label}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {i === 0 ? "Eleanor's top pick" : i === 1 ? "Alternative" : "Backup option"}
                    </p>
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <CheckCircle2 size={24} className="text-primary flex-shrink-0" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </div>
        </AnimatePresence>

        <button
          onClick={handleConfirm}
          disabled={!selectedTime || isConfirming}
          className="w-full py-4 bg-primary text-primary-foreground rounded-full font-medium text-lg hover:bg-primary/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.2)] flex items-center justify-center gap-2"
        >
          {isConfirming ? (
            <><Loader2 size={20} className="animate-spin" /> Confirming...</>
          ) : (
            <>Confirm this time <Sprout size={20} /></>
          )}
        </button>
      </div>
    </Layout>
  );
}
