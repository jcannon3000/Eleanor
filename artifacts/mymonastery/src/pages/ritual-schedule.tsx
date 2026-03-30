import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
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

type ScheduleMode = "flexible" | "fixed";

export default function RitualSchedule() {
  const [, params] = useRoute("/ritual/:id/schedule");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const ritualId = parseInt(params?.id || "0", 10);

  const [ritualName, setRitualName] = useState("");
  const [locationEdit, setLocationEdit] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<ScheduleMode>("flexible");

  // Flexible mode state
  const [times, setTimes] = useState<string[]>(["", "", ""]);
  const [shownSlots, setShownSlots] = useState(1);

  // Fixed mode state
  const [fixedTime, setFixedTime] = useState("");

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
          fetch(`/api/rituals/${ritualId}/suggested-times?tzOffset=${new Date().getTimezoneOffset()}`, { credentials: "include" }),
        ]);
        if (ritualRes.ok) {
          const ritual = await ritualRes.json();
          setRitualName(ritual.name ?? "");
          setLocationEdit(ritual.location ?? "");
        }
        if (timesRes.ok) {
          const data = await timesRes.json();
          const proposed: string[] = data.proposedTimes ?? [];
          const filled = proposed.map((t: string) => isoToLocalInput(t));
          setTimes([filled[0] || "", filled[1] || "", filled[2] || ""]);
          if (filled[0]) setFixedTime(filled[0]);
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

  const saveToApi = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/rituals/${ritualId}/proposed-times`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to save");
  };

  const handleFixedConfirm = async () => {
    if (!fixedTime) {
      toast({ variant: "destructive", title: "Pick a time to continue" });
      return;
    }
    setIsSaving(true);
    try {
      const iso = localInputToISO(fixedTime);
      await saveToApi({
        proposedTimes: [iso],
        confirmedTime: iso,
        location: locationEdit.trim() || undefined,
      });
      toast({
        title: "Gathering confirmed 🌱",
        description: "Eleanor will send calendar invites to your circle.",
      });
      setLocation(`/ritual/${ritualId}`);
    } catch {
      toast({ variant: "destructive", title: "Could not save the gathering time" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFlexibleSave = async () => {
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
      await saveToApi({
        proposedTimes: validTimes,
        location: locationEdit.trim() || undefined,
      });
      toast({
        title: "Options saved 🌿",
        description: "Eleanor will share these times with your circle.",
      });
      setLocation(`/ritual/${ritualId}`);
    } catch {
      toast({ variant: "destructive", title: "Could not save gathering times" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto w-full pt-8 text-center space-y-6">
          <div className="text-5xl animate-pulse">🌱</div>
          <p className="text-muted-foreground text-lg">Tending your schedule...</p>
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
          ← Back to {ritualName || "circle"}
        </button>

        <div className="mb-8">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Set gathering times</p>
          <h1 className="text-3xl font-semibold text-foreground mb-3">When can you gather?</h1>
          <p className="text-muted-foreground leading-relaxed">
            A fixed time is perfect when everyone can make it. Flexible lets your circle vote — more options means more people can bloom. 🌸
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-secondary rounded-2xl mb-8">
          <button
            onClick={() => setMode("fixed")}
            className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
              mode === "fixed"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📅 Fixed time
          </button>
          <button
            onClick={() => setMode("flexible")}
            className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${
              mode === "flexible"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            🗓️ Flexible options
          </button>
        </div>

        <AnimatePresence mode="wait">
          {mode === "fixed" ? (
            <motion.div
              key="fixed"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 mb-8"
            >
              <div className="bg-card border border-card-border rounded-2xl p-5">
                <p className="font-medium text-foreground mb-0.5">When will you gather?</p>
                <p className="text-sm text-muted-foreground mb-3">One time, confirmed. Eleanor will send everyone a calendar invite.</p>
                <input
                  type="datetime-local"
                  value={fixedTime}
                  onChange={(e) => setFixedTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm"
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="flexible"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4 mb-6"
            >
              {Array.from({ length: shownSlots }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.06 }}
                  className="bg-card border border-card-border rounded-2xl p-5"
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
                        className="text-muted-foreground hover:text-destructive transition-colors mt-0.5 flex-shrink-0 text-lg leading-none"
                        aria-label="Remove this option"
                      >
                        ✕
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

              {shownSlots < 3 && (
                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setShownSlots((s) => Math.min(s + 1, 3))}
                  className="w-full py-3 border-2 border-dashed border-border rounded-2xl text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                >
                  + Add {shownSlots === 1 ? "a backup" : "another backup"} time
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Location */}
        <div className="bg-card border border-card-border rounded-2xl p-5 mb-8">
          <label className="block font-medium text-foreground mb-0.5">
            📍 Where will you gather?
          </label>
          <p className="text-sm text-muted-foreground mb-3">Optional — shows up in calendar invites.</p>
          <input
            type="text"
            value={locationEdit}
            onChange={(e) => setLocationEdit(e.target.value)}
            placeholder="e.g. Central Park, The usual café, Someone's place"
            className="w-full px-4 py-3 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all text-sm"
          />
        </div>

        {/* Action button */}
        {mode === "fixed" ? (
          <button
            onClick={handleFixedConfirm}
            disabled={isSaving || !fixedTime}
            className="w-full py-4 bg-primary text-primary-foreground rounded-full font-semibold text-lg hover:bg-primary/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(107,143,113,0.3)] flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Confirming...</>
            ) : (
              <>Confirm this gathering 🌱</>
            )}
          </button>
        ) : (
          <button
            onClick={handleFlexibleSave}
            disabled={isSaving || !times[0]}
            className="w-full py-4 bg-primary text-primary-foreground rounded-full font-semibold text-lg hover:bg-primary/90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(107,143,113,0.3)] flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <><span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" /> Saving...</>
            ) : (
              <>Save gathering times 🌿</>
            )}
          </button>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          {mode === "fixed"
            ? "Eleanor will send calendar invites to everyone in your circle."
            : "Eleanor will reach out to your circle with these options."}
        </p>
      </div>
    </Layout>
  );
}
