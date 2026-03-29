import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowLeft, Plus, X, Loader2, Sprout } from "lucide-react";
import { useCreateRitual, CreateRitualBodyFrequency } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  { id: 1, title: "Name" },
  { id: 2, title: "Circle" },
  { id: 3, title: "Rhythm" },
  { id: 4, title: "Intention" },
];

export default function CreateRitual() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const createMutation = useCreateRitual();

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [participants, setParticipants] = useState([{ name: "", email: "" }]);
  const [frequency, setFrequency] = useState<CreateRitualBodyFrequency>("weekly");
  const [dayPreference, setDayPreference] = useState("");
  const [intention, setIntention] = useState("");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const handleNext = () => setStep(s => Math.min(STEPS.length, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  const addParticipant = () => {
    if (participants.length >= 8) return;
    setParticipants([...participants, { name: "", email: "" }]);
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const updateParticipant = (index: number, field: 'name' | 'email', value: string) => {
    const newP = [...participants];
    newP[index][field] = value;
    setParticipants(newP);
  };

  const handleSubmit = async () => {
    if (!user) return;

    const validParticipants = participants.filter(p => p.name.trim() && p.email.trim());

    if (!validParticipants.some(p => p.email === user.email)) {
      validParticipants.push({ name: user.name, email: user.email });
    }

    try {
      const ritual = await createMutation.mutateAsync({
        data: {
          name: name.trim(),
          frequency,
          dayPreference: dayPreference.trim(),
          participants: validParticipants,
          intention: intention.trim() || undefined,
          ownerId: user.id
        }
      });

      toast({
        title: "Your ritual is taking root",
        description: "Eleanor will help it grow. Keep showing up.",
      });
      setLocation(`/ritual/${ritual.id}`);
    } catch {
      toast({
        variant: "destructive",
        title: "Something didn't take root",
        description: "Please check your details and try again.",
      });
    }
  };

  const isStepValid = () => {
    if (step === 1) return name.trim().length > 0;
    if (step === 2) return participants.some(p => p.name.trim() && p.email.trim());
    if (step === 3) return dayPreference.trim().length > 0;
    return true;
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-8">

        {/* Progress header */}
        <div className="mb-12">
          <button
            onClick={() => setLocation("/dashboard")}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-8 transition-colors"
          >
            <ArrowLeft size={16} /> Back to Garden
          </button>

          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-1">Plant a Ritual</p>
            <p className="text-sm text-muted-foreground">Step {step} of {STEPS.length} — {STEPS[step - 1].title}</p>
          </div>

          <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${(step / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-card rounded-[2rem] p-8 md:p-12 shadow-[var(--shadow-warm-lg)] border border-card-border min-h-[420px] flex flex-col relative overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="flex-1"
            >

              {step === 1 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-serif mb-2">What do you want to grow?</h2>
                    <p className="text-muted-foreground">Give your ritual a simple, clear name.</p>
                  </div>
                  <input
                    autoFocus
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && isStepValid() && handleNext()}
                    placeholder="e.g. Thursday Run Crew, Monthly Dinner Club"
                    className="w-full text-xl md:text-2xl px-0 py-4 bg-transparent border-b-2 border-border focus:border-primary focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-serif mb-2">Who is in your circle?</h2>
                    <p className="text-muted-foreground">Add up to 8 people. Eleanor will include them.</p>
                  </div>

                  <div className="space-y-4">
                    {participants.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <input
                          type="text"
                          value={p.name}
                          onChange={e => updateParticipant(i, 'name', e.target.value)}
                          placeholder="Name"
                          className="flex-1 px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                        />
                        <input
                          type="email"
                          value={p.email}
                          onChange={e => updateParticipant(i, 'email', e.target.value)}
                          placeholder="Email"
                          className="flex-[1.5] px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                        />
                        {participants.length > 1 && (
                          <button
                            onClick={() => removeParticipant(i)}
                            className="p-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-colors"
                          >
                            <X size={20} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {participants.length < 8 && (
                    <button
                      onClick={addParticipant}
                      className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium px-2 py-2"
                    >
                      <Plus size={18} /> Add another person
                    </button>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-3xl font-serif mb-2">How often will you gather?</h2>
                    <p className="text-muted-foreground">Consistency is what turns intention into tradition.</p>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium mb-3 text-foreground">Cadence</label>
                      <div className="grid grid-cols-3 gap-3">
                        {(['weekly', 'biweekly', 'monthly'] as CreateRitualBodyFrequency[]).map(freq => (
                          <button
                            key={freq}
                            onClick={() => setFrequency(freq)}
                            className={`py-3 px-4 rounded-xl border font-medium capitalize transition-all ${
                              frequency === freq
                                ? 'bg-primary border-primary text-primary-foreground shadow-md'
                                : 'bg-background border-border text-foreground hover:border-primary/50'
                            }`}
                          >
                            {freq}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-3 text-foreground">Preferred day and time</label>
                      <input
                        type="text"
                        value={dayPreference}
                        onChange={e => setDayPreference(e.target.value)}
                        placeholder="e.g. Thursday evenings, Last Sunday of the month at 6pm"
                        className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-3xl font-serif mb-2">Set your intention</h2>
                    <p className="text-muted-foreground">
                      What do you hope to grow through this gathering? Eleanor will keep this in mind.{" "}
                      <span className="opacity-60">(Optional)</span>
                    </p>
                  </div>
                  <textarea
                    value={intention}
                    onChange={e => setIntention(e.target.value)}
                    placeholder="e.g. Staying close after college, building a creative practice together, simply showing up for each other..."
                    className="w-full px-4 py-4 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all resize-none h-36"
                  />
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          <div className="mt-12 flex justify-between items-center pt-6 border-t border-border/50">
            {step > 1 ? (
              <button
                onClick={handlePrev}
                className="px-6 py-3 font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
            ) : <div />}

            {step < STEPS.length ? (
              <button
                onClick={handleNext}
                disabled={!isStepValid()}
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!isStepValid() || createMutation.isPending}
                className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-full font-medium hover:shadow-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_4px_14px_rgba(45,74,62,0.25)]"
              >
                {createMutation.isPending ? (
                  <><Loader2 size={18} className="animate-spin" /> Planting...</>
                ) : (
                  <>Plant It <Sprout size={18} /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
