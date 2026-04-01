import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";

// ─── Tradition templates ──────────────────────────────────────────────────────

const TRADITION_TEMPLATES = [
  {
    id: "morning-coffee",
    emoji: "☕",
    name: "Morning Coffee",
    desc: "Share your first cup, in person or wherever you are",
    prefill: {
      name: "Morning Coffee ☕",
      intention: "We meet over coffee. It doesn't matter where we are — we start the morning together.",
    },
  },
  {
    id: "friday-dinner",
    emoji: "🍕",
    name: "Friday Dinner",
    desc: "A standing dinner, week after week",
    prefill: {
      name: "Friday Dinner 🍕",
      intention: "Every Friday. The same table, the same people, again and again. This is what we come home to.",
    },
  },
  {
    id: "weekly-walk",
    emoji: "🚶",
    name: "Weekly Walk",
    desc: "Move together on a regular day",
    prefill: {
      name: "Weekly Walk 🚶",
      intention: "We walk together. Same path, different conversations. This is our rhythm.",
    },
  },
  {
    id: "book-club",
    emoji: "📚",
    name: "Book Club",
    desc: "Read together, gather to talk",
    prefill: {
      name: "Book Club 📚",
      intention: "We read together and come back to talk about what it meant. The book is the beginning of the conversation.",
    },
  },
  {
    id: "monthly-gathering",
    emoji: "🎉",
    name: "Monthly Gathering",
    desc: "Come together once a month",
    prefill: {
      name: "Monthly Gathering 🎉",
      intention: "Once a month. We show up in the same room and remember what we are to each other.",
    },
  },
  {
    id: "weekend-ritual",
    emoji: "🌅",
    name: "Weekend Ritual",
    desc: "A recurring moment on the weekend",
    prefill: {
      name: "Weekend Ritual 🌅",
      intention: "The weekend belongs to us. Something to look forward to, again and again.",
    },
  },
  {
    id: "breathe-together",
    emoji: "🌬️",
    name: "Breathe Together",
    desc: "Pause together in stillness, wherever you are",
    prefill: {
      name: "Breathe Together 🌬️",
      intention: "We stop wherever we are and breathe together. Same moment, same rhythm.",
    },
  },
  {
    id: "tradition-custom",
    emoji: "🌱",
    name: "Plant your own",
    desc: "Create a tradition from scratch",
    prefill: null,
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TraditionNew() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Intro splash (1.5s, first use only)
  const [showIntro, setShowIntro] = useState(() => !localStorage.getItem("eleanor_tradition_intro_seen"));

  useEffect(() => {
    if (showIntro) {
      localStorage.setItem("eleanor_tradition_intro_seen", "1");
      const t = setTimeout(() => setShowIntro(false), 1600);
      return () => clearTimeout(t);
    }
  }, [showIntro]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  function selectTemplate(t: typeof TRADITION_TEMPLATES[0]) {
    if (t.prefill) {
      sessionStorage.setItem(
        "eleanor_tradition_prefill",
        JSON.stringify({ name: t.prefill.name, intention: t.prefill.intention })
      );
    } else {
      sessionStorage.removeItem("eleanor_tradition_prefill");
    }
    setLocation("/create?type=tradition");
  }

  // ── Intro splash ────────────────────────────────────────────────────────────
  if (showIntro) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center min-h-[70vh]">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm mx-auto"
          >
            <div className="bg-[#FDF3E3] border border-[#C17F24]/20 rounded-[2rem] p-10 text-center shadow-[var(--shadow-warm-lg)]">
              <div className="text-5xl mb-5">🌱</div>
              <p className="text-[#2C1A0E] font-serif text-[1.1rem] leading-relaxed italic">
                "Traditions bring you together.
                <br /><br />
                A recurring gathering — dinner, a walk, a coffee — that Eleanor tends so it actually keeps happening."
              </p>
            </div>
          </motion.div>
        </div>
      </Layout>
    );
  }

  // ── Template selection ───────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-6 pb-16">

        {/* Back */}
        <button
          onClick={() => setLocation("/dashboard")}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-6 transition-colors"
        >
          ← Back to Garden
        </button>

        <div className="bg-card rounded-[2rem] p-6 pt-8 shadow-[var(--shadow-warm-lg)] border border-card-border min-h-[440px]">
          {/* Header */}
          <div className="mb-5">
            <h2 className="text-2xl font-semibold text-foreground mb-1">What tradition will you plant? 🌱</h2>
            <p className="text-sm text-muted-foreground italic">
              Recurring gatherings that bring you together, again and again. Everything can be edited.
            </p>
          </div>

          {/* Template cards */}
          <div className="grid gap-3">
            {TRADITION_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => selectTemplate(t)}
                className="w-full text-left p-4 rounded-2xl border border-border/60 hover:border-[#C17F24]/50 hover:bg-[#C17F24]/5 transition-all flex items-center gap-4 group"
              >
                <span className="text-3xl">{t.emoji}</span>
                <div className="flex-1">
                  <p className="font-semibold text-foreground text-sm group-hover:text-[#A06B1A]">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </div>
                <span className="ml-auto text-muted-foreground/40 text-sm">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
