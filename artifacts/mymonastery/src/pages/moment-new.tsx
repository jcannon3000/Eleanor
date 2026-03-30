import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
type StepId = "template" | "intercession" | "name" | "intention" | "logging" | "schedule" | "goal" | "invite";
type LoggingType = "reflection" | "timer" | "timer_reflection" | "checkin";
type Frequency = "daily" | "weekly";
type TimeOfDay = "morning" | "midday" | "afternoon" | "night";

const SPIRITUAL_TEMPLATES = new Set(["morning-prayer", "evening-prayer", "intercession", "breath", "contemplative", "walk"]);

const TIME_OF_DAY_OPTIONS: { id: TimeOfDay; emoji: string; label: string; sub: string; range: string }[] = [
  { id: "morning",   emoji: "🌅", label: "Morning",   sub: "As the day begins",              range: "Roughly 6am – 10am" },
  { id: "midday",    emoji: "☀️",  label: "Midday",    sub: "A pause at the center of the day", range: "Roughly 11am – 2pm" },
  { id: "afternoon", emoji: "🌤", label: "Afternoon", sub: "Before the day winds down",       range: "Roughly 2pm – 6pm" },
  { id: "night",     emoji: "🌙", label: "Night",     sub: "As the day releases",             range: "Roughly 7pm – 10pm" },
];

interface ContactSuggestion { name: string; email: string; }

interface BcpPrayer { category: string; title: string; text: string; }

// ─── BCP Prayers (Book of Common Prayer, public domain) ──────────────────────
const BCP_PRAYERS: BcpPrayer[] = [
  {
    category: "For the Church",
    title: "For the Universal Church",
    text: "O God of unchangeable power and eternal light: Look favorably on your whole Church, that wonderful and sacred mystery; by the effectual working of your providence, carry out in tranquillity the plan of salvation; let the whole world see and know that things which were cast down are being raised up, and things which had grown old are being made new, and that all things are being brought to their perfection by him through whom all things were made, your Son Jesus Christ our Lord. Amen.",
  },
  {
    category: "For the Mission of the Church",
    title: "For the Spread of the Gospel",
    text: "O God of all nations of the earth: Remember the multitudes who have been created in your image but have not known the redeeming work of our Savior Jesus Christ; and grant that, by the prayers and labors of your holy Church, they may be brought to know and worship you as you have been revealed in your Son; who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen.",
  },
  {
    category: "For the Nation",
    title: "For Our Country",
    text: "Almighty God, who has given us this good land as our heritage: We humbly ask that we may always prove ourselves a people mindful of your favor and glad to do your will. Bless our land with honorable industry, sound learning, and pure manners. Save us from violence, discord, and confusion; from pride and arrogance, and from every evil way. In the time of prosperity, fill our hearts with thankfulness, and in the day of trouble, suffer not our trust in you to fail. Amen.",
  },
  {
    category: "For the World",
    title: "For Peace Among Nations",
    text: "Almighty God, our heavenly Father, guide the nations of the world into the way of justice and truth, and establish among them that peace which is the fruit of righteousness, that they may become the kingdom of our Lord and Savior Jesus Christ. Amen.",
  },
  {
    category: "For the Natural Order",
    title: "For the Conservation of Natural Resources",
    text: "Almighty God, in giving us dominion over things on earth, you made us fellow workers in your creation: Give us wisdom and reverence so to use the resources of nature, that no one may suffer from our abuse of them, and that generations yet to come may continue to praise you for your bounty; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For the Poor and Neglected",
    title: "For Those in Poverty",
    text: "Almighty and most merciful God, we remember before you all poor and neglected persons whom it would be easy for us to forget: the homeless and the destitute, the old and the sick, and all who have none to care for them. Help us to heal those who are broken in body or spirit, and to turn their sorrow into joy. Grant this, Father, for the love of your Son, who for our sake became poor, Jesus Christ our Lord. Amen.",
  },
  {
    category: "For the Sick",
    title: "For the Sick",
    text: "Heavenly Father, giver of life and health: Comfort and relieve your sick servants, and give your power of healing to those who minister to their needs, that those for whom our prayers are offered may be strengthened in their weakness and have confidence in your loving care; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.",
  },
  {
    category: "For the Sorrowing",
    title: "For the Bereaved",
    text: "Almighty God, Father of mercies and giver of comfort: Deal graciously, we pray, with all who mourn; that, casting every care on you, they may know the consolation of your love; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For Those in Need",
    title: "For Those Who Are in Trouble",
    text: "O merciful Father, who has taught us in your holy Word that you do not willingly afflict or grieve the children of men: Look with pity upon the sorrows of your servants for whom our prayers are offered. Remember them, O Lord, in mercy, nourish their souls with patience, comfort them with a sense of your goodness, lift up your countenance upon them, and give them peace; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For Prisons and Correctional Institutions",
    title: "For Those in Prison",
    text: "Lord Jesus, for our sake you were condemned as a criminal: Visit our jails and prisons with your pity and judgment. Remember all prisoners, and bring the guilty to repentance and amendment of life according to your will, and give them hope for their future. When any are held unjustly, bring them release; forgive us, and teach us to improve our justice. Remember those who work in these institutions; keep them humane and compassionate; and save them from becoming brutal or callous. And since what we do for those in prison, O Lord, we do for you, constrain us to improve their lot. All this we ask for your mercy's sake. Amen.",
  },
  {
    category: "For Those We Love",
    title: "For a Person",
    text: "O gracious Father, we humbly ask for your gentle care for the person we pray for now. Keep them ever in your love; teach them to love you with all their heart, with all their soul, with all their mind, and with all their strength; and, loving you, to love also all whom you love; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For a Person in Trouble or Bereavement",
    title: "For a Person in Trouble",
    text: "This is another day, O Lord. I know not what it will bring forth, but make me ready, Lord, for whatever it may be. If I am to stand up, help me to stand bravely. If I am to sit still, help me to sit quietly. If I am to lie low, help me to do it patiently. And if I am to do nothing, let me do it gallantly. Make these words more than words, and give me the Spirit of Jesus. Amen.",
  },
  {
    category: "For the Human Family",
    title: "For the Human Family",
    text: "O God, you made us in your own image and redeemed us through Jesus your Son: Look with compassion on the whole human family; take away the arrogance and hatred which infect our hearts; break down the walls that separate us; unite us in bonds of love; and work through our struggle and confusion to accomplish your purposes on earth; that, in your good time, all nations and races may serve you in harmony around your heavenly throne; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For Peace",
    title: "For Peace",
    text: "Eternal God, in whose perfect kingdom no sword is drawn but the sword of righteousness, no strength known but the strength of love: So mightily spread abroad your Spirit, that all peoples may be gathered under the banner of the Prince of Peace, as children of one Father; to whom be dominion and glory, now and for ever. Amen.",
  },
  {
    category: "For the Environment",
    title: "For the Environment",
    text: "We call on you, O God, for our home the earth, that we may be worthy of it. We call on you, O God, for the health of the earth so that we may live with gratitude in it. We call on you, O God, for those who share the earth, that we may live with reverence for it. We call on you, O God, for those who will inherit the earth, that we may leave it to them as a gift. Through Christ who came that we might have life. Amen.",
  },
  {
    category: "For Social Justice",
    title: "For Social Justice",
    text: "Grant, O God, that your holy and life-giving Spirit may so move every human heart, and especially the hearts of the people of this land, that barriers which divide us may crumble, suspicions disappear, and hatreds cease; that our divisions being healed, we may live in justice and peace; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For Young Persons",
    title: "For Young Persons",
    text: "God our Father, you see your children growing up in an unsteady and confusing world: Show them that your ways give more life than the ways of the world, and that following you is better than chasing after selfish goals. Help them to take failure, not as a measure of their worth, but as a chance for a new start. Give them strength to hold their faith in you, and to keep alive their joy in your creation; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "For the Aged",
    title: "For the Aged",
    text: "Look with mercy, O God our Father, on all whose increasing years bring them weakness, distress, or isolation. Provide for them homes of dignity and peace; give them understanding helpers, and the willingness to accept help; and, as their strength diminishes, increase their faith and their assurance of your love. This we ask in the name of Jesus Christ our Lord. Amen.",
  },
  {
    category: "For Those Who Influence Public Opinion",
    title: "For Those Who Influence Public Opinion",
    text: "Almighty God, you proclaim your truth in every age by many voices: Direct, in our time, we pray, those who speak where many listen and write what many read; that they may do their part in making the heart of this people wise, its mind sound, and its will righteous; to the honor of Jesus Christ our Lord. Amen.",
  },
];

// ─── Templates ───────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: "morning-prayer", emoji: "🌅", name: "Morning Prayer",
    desc: "Open the day together in prayer",
    prefill: {
      name: "Morning Prayer 🌅",
      intention: "We open the day together. Before the world begins, we pray.",
      loggingType: "timer_reflection" as LoggingType,
      timerDuration: 10,
      reflectionPrompt: "What are you carrying into this day?",
      scheduledHour: 7, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "evening-prayer", emoji: "🌙", name: "Evening Prayer",
    desc: "Close the day together before rest",
    prefill: {
      name: "Evening Prayer 🌙",
      intention: "Before we rest, we release the day together. We pray.",
      loggingType: "timer_reflection" as LoggingType,
      timerDuration: 10,
      reflectionPrompt: "What are you releasing tonight?",
      scheduledHour: 9, scheduledAmPm: "PM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "intercession", emoji: "🙏", name: "Intercession",
    desc: "Hold a shared prayer for something that matters",
    prefill: {
      name: "Intercession 🙏",
      intention: "",
      loggingType: "timer_reflection" as LoggingType,
      timerDuration: 5,
      reflectionPrompt: "What are you holding today?",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "breath", emoji: "🌬️", name: "Breath Together",
    desc: "Two minutes of shared breath across the distance",
    prefill: {
      name: "Breath Together 🌬️",
      intention: "Two minutes. Wherever we are. We breathe at the same time and remember we are not alone.",
      loggingType: "timer" as LoggingType,
      timerDuration: 2,
      reflectionPrompt: "",
      scheduledHour: 12, scheduledAmPm: "PM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "contemplative", emoji: "🕯️", name: "Contemplative Sit",
    desc: "Sit together in stillness",
    prefill: {
      name: "Contemplative Sit 🕯️",
      intention: "We sit together in the silence. No agenda. Just presence.",
      loggingType: "timer_reflection" as LoggingType,
      timerDuration: 10,
      reflectionPrompt: "What arose in the stillness?",
      scheduledHour: 7, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "walk", emoji: "🚶", name: "Walk Together",
    desc: "Ten minutes outside, wherever you are",
    prefill: {
      name: "Walk Together 🚶",
      intention: "Step outside. We are walking at the same time, in different places, under the same sky.",
      loggingType: "reflection" as LoggingType,
      timerDuration: 10,
      reflectionPrompt: "What did you notice?",
      scheduledHour: 12, scheduledAmPm: "PM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "morning-coffee", emoji: "☕", name: "Morning Coffee",
    desc: "Share your first cup across the distance",
    prefill: {
      name: "Morning Coffee ☕",
      intention: "Wherever we are, we are having coffee together. Share your cup.",
      loggingType: "checkin" as LoggingType,
      timerDuration: 10,
      reflectionPrompt: "",
      scheduledHour: 8, scheduledAmPm: "AM" as "AM" | "PM",
      frequency: "daily" as Frequency,
    },
  },
  {
    id: "custom", emoji: "🌱", name: "Begin from stillness",
    desc: "Create your own practice from scratch",
    prefill: null,
  },
];

// ─── Milestone goal options ───────────────────────────────────────────────────
const GOAL_OPTIONS = [
  { days: 3, emoji: "🌱", label: "Three days", sub: "first roots" },
  { days: 7, emoji: "🌿", label: "One week", sub: "seven days" },
  { days: 14, emoji: "🌸", label: "Two weeks", sub: "fourteen days, then renew" },
  { days: 0, emoji: "✨", label: "Just begin", sub: "no goal, tend freely" },
];

// ─── Logging type options ─────────────────────────────────────────────────────
const LOGGING_OPTIONS: { type: LoggingType; icon: string; label: string; description: string }[] = [
  { type: "reflection", icon: "✍️", label: "Reflection", description: "A written response to a prompt" },
  { type: "timer", icon: "⏱️", label: "Meditation timer", description: "A shared countdown — sit, breathe, or pray together" },
  { type: "checkin", icon: "✅", label: "Just show up", description: "No words needed. Mark that you were present." },
];

const TIMER_DURATIONS = [2, 5, 10, 15, 20];

// ─── Contact search hook ──────────────────────────────────────────────────────
function useContactSearch(query: string) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.length < 2) { setSuggestions([]); return; }
    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/contacts/search?q=${encodeURIComponent(query)}`, { credentials: "include" });
        setSuggestions(res.ok ? await res.json() : []);
      } catch { setSuggestions([]); }
      finally { setIsLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  return { suggestions, isLoading, clearSuggestions: () => setSuggestions([]) };
}

// ─── Person row ───────────────────────────────────────────────────────────────
function PersonRow({ person, index, showRemove, onUpdate, onRemove, onSelect }: {
  person: { name: string; email: string }; index: number; showRemove: boolean;
  onUpdate: (i: number, f: "name" | "email", v: string) => void;
  onRemove: (i: number) => void;
  onSelect: (i: number, c: ContactSuggestion) => void;
}) {
  const [activeField, setActiveField] = useState<"name" | "email" | null>(null);
  const [justSelected, setJustSelected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchQuery = activeField === "name" ? person.name : activeField === "email" ? person.email : "";
  const { suggestions, isLoading, clearSuggestions } = useContactSearch(justSelected ? "" : searchQuery);

  const handleSelect = useCallback((contact: ContactSuggestion) => {
    setJustSelected(true); setActiveField(null); clearSuggestions();
    onSelect(index, contact);
    setTimeout(() => setJustSelected(false), 500);
  }, [index, onSelect, clearSuggestions]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActiveField(null); clearSuggestions();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [clearSuggestions]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input type="text" value={person.name}
            onChange={e => { setJustSelected(false); onUpdate(index, "name", e.target.value); }}
            onFocus={() => setActiveField("name")}
            placeholder="Name" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        <div className="relative flex-[1.5]">
          <input type="email" value={person.email}
            onChange={e => { setJustSelected(false); onUpdate(index, "email", e.target.value); }}
            onFocus={() => setActiveField("email")}
            placeholder="Email" autoComplete="off"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all"
          />
        </div>
        {showRemove && (
          <button onClick={() => onRemove(index)} className="text-muted-foreground hover:text-destructive transition-colors text-lg px-1">×</button>
        )}
      </div>
      {(suggestions.length > 0 || isLoading) && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {isLoading && <div className="px-4 py-3 text-sm text-muted-foreground">Searching...</div>}
          {suggestions.map((s, i) => (
            <button key={i} onMouseDown={e => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors border-b border-border/50 last:border-0">
              <span className="font-medium text-sm">{s.name}</span>
              <span className="text-muted-foreground text-xs ml-2">{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BCP Prayer List ──────────────────────────────────────────────────────────
function BcpPrayerList({ onSelect }: { onSelect: (prayer: BcpPrayer) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const grouped = BCP_PRAYERS.reduce<Record<string, BcpPrayer[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
      {Object.entries(grouped).map(([cat, prayers]) => (
        <div key={cat}>
          <p className="text-xs font-bold text-[#4a3728] uppercase tracking-widest mb-2">{cat}</p>
          {prayers.map(p => (
            <div key={p.title} className="border border-border/40 rounded-xl mb-2 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors"
                onClick={() => setExpanded(expanded === p.title ? null : p.title)}
              >
                <span className="font-medium text-sm text-foreground">{p.title}</span>
                <span className="text-muted-foreground text-xs">{expanded === p.title ? "▲" : "▼"}</span>
              </button>
              {expanded === p.title && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground italic leading-relaxed mb-3">
                    {p.text.substring(0, 120)}...
                  </p>
                  <button
                    onClick={() => onSelect(p)}
                    className="text-sm text-white bg-[#6B8F71] rounded-full px-4 py-2 hover:bg-[#5a7a60] transition-colors"
                  >
                    Select this prayer →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Milestone streak helper ──────────────────────────────────────────────────
export function milestoneLabel(streak: number): string {
  if (streak < 3) return `🌱 Day ${streak + 1} of 3`;
  if (streak < 7) return `🌱✓  🌿 Day ${streak + 1} of 7`;
  if (streak < 14) return `🌱✓  🌿✓  🌸 Day ${streak + 1} of 14`;
  return `🌸 14 days — ready to renew`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MomentNew() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  // Step navigation
  const [step, setStep] = useState<StepId>("template");
  const [done, setDone] = useState(false);
  const [createdMomentId, setCreatedMomentId] = useState<number | null>(null);

  // Template
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Intercession
  const [intercessionMode, setIntercessionMode] = useState<"choose" | "bcp" | "custom" | null>(null);
  const [intercessionTopic, setIntercessionTopic] = useState("");
  const [intercessionSource, setIntercessionSource] = useState<"bcp" | "custom">("custom");
  const [intercessionFullText, setIntercessionFullText] = useState("");
  const [selectedBcpPrayer, setSelectedBcpPrayer] = useState<BcpPrayer | null>(null);

  // Core fields
  const [name, setName] = useState("");
  const [intention, setIntention] = useState("");
  const [loggingType, setLoggingType] = useState<LoggingType>("reflection");
  const [timerDuration, setTimerDuration] = useState(10);
  const [hasReflectionAfterTimer, setHasReflectionAfterTimer] = useState(false);
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [scheduledDays, setScheduledDays] = useState<string[]>([]);
  const [scheduledHour, setScheduledHour] = useState(8);
  const [scheduledMinute, setScheduledMinute] = useState(0);
  const [scheduledAmPm, setScheduledAmPm] = useState<"AM" | "PM">("AM");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);
  const [goalDays, setGoalDays] = useState(7);
  const [participants, setParticipants] = useState([{ name: "", email: "" }]);

  // Organizer personal time (after creation for spiritual templates)
  const [showPersonalTimePrompt, setShowPersonalTimePrompt] = useState(false);
  const [personalTimeDone, setPersonalTimeDone] = useState(false);
  const [personalHour, setPersonalHour] = useState(8);
  const [personalMinute, setPersonalMinute] = useState(0);
  const [personalAmPm, setPersonalAmPm] = useState<"AM" | "PM">("AM");
  const [personalTimezone, setPersonalTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  const scheduledTime = (() => {
    let h = scheduledHour % 12;
    if (scheduledAmPm === "PM") h += 12;
    if (h === 12 && scheduledAmPm === "AM") h = 0;
    return `${String(h).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`;
  })();

  const dayOfWeek = frequency === "weekly" && scheduledDays.length === 1 ? scheduledDays[0] : undefined;
  const isSpiritual = SPIRITUAL_TEMPLATES.has(templateId ?? "");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // ─── Template selection handler ─────────────────────────────────────────────
  function selectTemplate(t: typeof TEMPLATES[0]) {
    setTemplateId(t.id);
    if (t.prefill) {
      setName(t.prefill.name);
      setIntention(t.prefill.intention);
      setLoggingType(t.prefill.loggingType);
      setTimerDuration(t.prefill.timerDuration);
      setReflectionPrompt(t.prefill.reflectionPrompt);
      setScheduledHour(t.prefill.scheduledHour);
      setScheduledAmPm(t.prefill.scheduledAmPm);
      setFrequency(t.prefill.frequency);
      if (t.prefill.loggingType === "timer_reflection") setHasReflectionAfterTimer(true);
    }
    if (t.id === "intercession") {
      setStep("intercession");
    } else {
      setStep("name");
    }
  }

  // ─── Intercession BCP selection ─────────────────────────────────────────────
  function selectBcpPrayer(prayer: BcpPrayer) {
    setSelectedBcpPrayer(prayer);
    setIntercessionTopic(prayer.title);
    setIntercessionSource("bcp");
    setIntercessionFullText(prayer.text);
    const firstSentence = prayer.text.split(". ")[0];
    setIntention(`We hold this together in prayer. ${prayer.title} — ${firstSentence}.`);
    setIntercessionMode(null);
    setStep("name");
  }

  function confirmCustomIntercession() {
    if (!intercessionTopic.trim()) return;
    setIntercessionSource("custom");
    setIntercessionFullText("");
    setIntention(`We hold this together in prayer. Today we intercede for: ${intercessionTopic.trim()}.`);
    setStep("name");
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const STEP_ORDER: StepId[] = ["template", ...(templateId === "intercession" ? ["intercession" as StepId] : []), "name", "intention", "logging", "schedule", "goal", "invite"];

  function goNext() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) setStep(STEP_ORDER[idx + 1]);
    else handleSubmit();
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
    else setLocation("/create");
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length;

  // ─── Validation ─────────────────────────────────────────────────────────────
  const canNext = () => {
    if (step === "template") return false;
    if (step === "intercession") return false;
    if (step === "name") return name.trim().length >= 2;
    if (step === "intention") return intention.trim().length >= 4;
    if (step === "logging") {
      if (loggingType === "reflection") return reflectionPrompt.trim().length >= 1;
      return true;
    }
    if (step === "schedule") {
      if (isSpiritual) return timeOfDay !== null;
      if (frequency === "weekly" && scheduledDays.length === 0) return false;
      return true;
    }
    if (step === "goal") return true;
    if (step === "invite") return true;
    return false;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const plantMutation = useMutation({
    mutationFn: (data: object) => apiRequest<{ moment: { id: number; momentToken: string } }>("POST", "/api/moments", data),
    onSuccess: (data) => {
      setCreatedMomentId(data.moment.id);
      setDone(true);
      if (isSpiritual) setShowPersonalTimePrompt(true);
    },
  });

  const personalTimeMutation = useMutation({
    mutationFn: (data: object) =>
      apiRequest<{ ok: boolean }>("POST", `/api/moments/${createdMomentId}/personal-time`, data),
    onSuccess: () => {
      setShowPersonalTimePrompt(false);
      setPersonalTimeDone(true);
    },
  });

  function handleSubmit() {
    const validParticipants = participants.filter(p => p.name.trim() && p.email.trim());
    const effectiveLoggingType: LoggingType = loggingType === "timer" && hasReflectionAfterTimer
      ? "timer_reflection"
      : loggingType;

    plantMutation.mutate({
      name: name.trim(),
      intention: intention.trim(),
      loggingType: effectiveLoggingType,
      reflectionPrompt: (effectiveLoggingType === "reflection" || effectiveLoggingType === "timer_reflection")
        ? reflectionPrompt.trim() || undefined
        : undefined,
      templateType: templateId,
      intercessionTopic: intercessionTopic.trim() || undefined,
      intercessionSource: intercessionTopic.trim() ? intercessionSource : undefined,
      intercessionFullText: intercessionFullText.trim() || undefined,
      timerDurationMinutes: (loggingType === "timer" || loggingType === "timer_reflection") ? timerDuration : undefined,
      frequency,
      scheduledTime: isSpiritual ? "08:00" : scheduledTime,
      dayOfWeek,
      goalDays,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timeOfDay: isSpiritual ? timeOfDay : undefined,
      participants: validParticipants,
    });
  }

  function handleSavePersonalTime() {
    let h = personalHour % 12;
    if (personalAmPm === "PM") h += 12;
    if (h === 12 && personalAmPm === "AM") h = 0;
    const ptStr = `${String(h).padStart(2, "0")}:${String(personalMinute).padStart(2, "0")}`;
    personalTimeMutation.mutate({ personalTime: ptStr, personalTimezone });
  }

  const sv = { initial: { opacity: 0, x: 20 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  if (authLoading) return null;

  // ─── Done / Confirmation ──────────────────────────────────────────────────────
  if (done) {
    const templateInfo = TEMPLATES.find(t => t.id === templateId);
    const [h, m] = scheduledTime.split(":").map(Number);
    const timeLabel = new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const goalLabel = GOAL_OPTIONS.find(g => g.days === goalDays);
    const todEmoji = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.emoji ?? "🌿";
    const todLabel = TIME_OF_DAY_OPTIONS.find(o => o.id === timeOfDay)?.label?.toLowerCase() ?? "morning";

    // ── Organizer personal time prompt (spiritual templates only) ────────────
    if (showPersonalTimePrompt) {
      return (
        <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-sm w-full text-[#F5EDD8]"
          >
            <div className="text-5xl mb-4 text-center">{todEmoji}</div>
            <h2 className="text-2xl font-semibold text-center mb-2">You've planted a {todLabel} practice.</h2>
            <p className="text-[#c9b99a] text-center text-sm mb-8">
              When in the {todLabel} works best for you?
            </p>

            <div className="bg-[#3a2410] rounded-2xl p-6 space-y-5">
              {/* Hour */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Hour</label>
                <div className="grid grid-cols-6 gap-1.5">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(hv => (
                    <button key={hv} onClick={() => setPersonalHour(hv)}
                      className={`py-2 rounded-lg border text-sm font-medium transition-all ${personalHour === hv ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                      {hv}
                    </button>
                  ))}
                </div>
              </div>
              {/* Minute */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Minute</label>
                <div className="flex gap-2">
                  {[0, 15, 30, 45].map(mv => (
                    <button key={mv} onClick={() => setPersonalMinute(mv)}
                      className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${personalMinute === mv ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                      :{String(mv).padStart(2, "0")}
                    </button>
                  ))}
                </div>
              </div>
              {/* AM/PM */}
              <div className="flex gap-3">
                {(["AM", "PM"] as const).map(p => (
                  <button key={p} onClick={() => setPersonalAmPm(p)}
                    className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${personalAmPm === p ? "border-[#6B8F71] bg-[#6B8F71]/20 text-[#9ecc9f]" : "border-[#5a3d28] text-[#c9b99a] hover:border-[#6B8F71]/40"}`}>
                    {p}
                  </button>
                ))}
              </div>
              {/* Timezone */}
              <div>
                <label className="block text-xs font-medium text-[#c9b99a] uppercase tracking-widest mb-2">Your timezone</label>
                <select value={personalTimezone} onChange={e => setPersonalTimezone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#2C1A0E] border border-[#5a3d28] text-[#F5EDD8] focus:border-[#6B8F71] focus:outline-none text-sm">
                  {Intl.supportedValuesOf("timeZone").map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-[#c9b99a]/60 italic text-center">
                This is when Eleanor will put it in your calendar.<br />
                Everyone in this practice chooses their own time.
              </p>
            </div>

            <button
              onClick={handleSavePersonalTime}
              disabled={personalTimeMutation.isPending}
              className="w-full mt-6 py-4 rounded-2xl bg-[#6B8F71] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
            >
              {personalTimeMutation.isPending ? "Saving..." : "Add to my calendar 🌿"}
            </button>
            {personalTimeMutation.isError && (
              <p className="text-xs text-red-400 text-center mt-2">Something went wrong. Please try again.</p>
            )}
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[#2C1A0E] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full text-center text-[#F5EDD8]"
        >
          <div className="text-6xl mb-6">🌱</div>
          <h2 className="text-3xl font-semibold mb-3">{name} is planted.</h2>
          {isSpiritual && timeOfDay ? (
            <p className="text-[#c9b99a] mb-2">{frequency === "daily" ? "Every day" : "Weekly"} · {todEmoji} {todLabel} practice</p>
          ) : (
            <p className="text-[#c9b99a] mb-2">{frequency === "daily" ? "Every day" : frequency === "weekly" ? `Weekly` : "Monthly"} at {timeLabel}</p>
          )}
          {goalDays > 0 && goalLabel && (
            <p className="text-[#c9b99a] mb-6">{goalLabel.emoji} {goalLabel.label}</p>
          )}
          <p className="text-[#c9b99a] mb-8 text-sm leading-relaxed">
            Invites are on their way.<br />
            {isSpiritual ? "Each person will choose their own time." : "Eleanor will ring the bell when it's time."}<br />
            You just have to show up.
          </p>
          <button
            onClick={() => createdMomentId ? setLocation(`/moments/${createdMomentId}`) : setLocation("/moments")}
            className="px-8 py-3 bg-[#6B8F71] text-white rounded-full font-medium hover:bg-[#5a7a60] transition-colors"
          >
            Done 🌿
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pt-6 pb-16">

        {/* Header + progress */}
        {step !== "template" && (
          <div className="mb-8">
            <button onClick={goBack} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-6 transition-colors">
              ← {step === "name" ? "Templates" : "Previous"}
            </button>
            <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[#6B8F71] rounded-full"
                animate={{ width: `${((stepIndex) / (totalSteps - 1)) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              />
            </div>
          </div>
        )}

        <div className={`bg-card rounded-[2rem] ${step === "template" ? "p-6 pt-8" : "p-8 md:p-12"} shadow-[var(--shadow-warm-lg)] border border-card-border min-h-[440px] flex flex-col`}>
          <AnimatePresence mode="wait">
            <motion.div key={step} variants={sv} initial="initial" animate="animate" exit="exit"
              transition={{ duration: 0.22 }} className="flex-1 flex flex-col">

              {/* ── Template selection ──────────────────────────── */}
              {step === "template" && (
                <div className="flex-1">
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-semibold text-foreground mb-1">What practice will you tend together? 🌿</h2>
                    <p className="text-sm text-muted-foreground italic">Choose a practice or begin from stillness. Everything can be edited.</p>
                  </div>
                  <div className="grid gap-3">
                    {TEMPLATES.map(t => (
                      <button key={t.id} onClick={() => selectTemplate(t)}
                        className="w-full text-left p-4 rounded-2xl border border-border/60 hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all flex items-center gap-4 group">
                        <span className="text-3xl">{t.emoji}</span>
                        <div>
                          <p className="font-semibold text-foreground text-sm group-hover:text-[#4a6b50]">{t.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                        </div>
                        <span className="ml-auto text-muted-foreground/40 text-sm">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Intercession sub-flow ───────────────────────── */}
              {step === "intercession" && (
                <div className="flex-1">
                  {intercessionMode === null && (
                    <>
                      <div className="mb-6">
                        <h2 className="text-2xl font-semibold mb-1">What will you hold in prayer together? 🙏</h2>
                        <p className="text-sm text-muted-foreground italic">Choose a prayer from the Book of Common Prayer, or name your own intention.</p>
                      </div>
                      <div className="grid gap-4">
                        <button onClick={() => setIntercessionMode("bcp")}
                          className="w-full text-left p-5 rounded-2xl border-2 border-border hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all">
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">📖</span>
                            <div>
                              <p className="font-semibold text-foreground">From the Book of Common Prayer</p>
                              <p className="text-sm text-muted-foreground mt-0.5">Choose from the traditional intercessions</p>
                            </div>
                          </div>
                        </button>
                        <button onClick={() => setIntercessionMode("custom")}
                          className="w-full text-left p-5 rounded-2xl border-2 border-border hover:border-[#6B8F71]/60 hover:bg-[#6B8F71]/5 transition-all">
                          <div className="flex items-start gap-4">
                            <span className="text-3xl">✍️</span>
                            <div>
                              <p className="font-semibold text-foreground">Name your own intention</p>
                              <p className="text-sm text-muted-foreground mt-0.5">Write what your practice will hold together</p>
                            </div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}

                  {intercessionMode === "bcp" && (
                    <>
                      <div className="mb-4 flex items-center gap-2">
                        <button onClick={() => setIntercessionMode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
                        <h2 className="text-lg font-semibold">Book of Common Prayer</h2>
                      </div>
                      <BcpPrayerList onSelect={selectBcpPrayer} />
                    </>
                  )}

                  {intercessionMode === "custom" && (
                    <>
                      <div className="mb-5 flex items-center gap-2">
                        <button onClick={() => setIntercessionMode(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">← Back</button>
                        <h2 className="text-lg font-semibold">Name your intention</h2>
                      </div>
                      <label className="block text-sm text-muted-foreground mb-2">What are you praying for together?</label>
                      <textarea
                        value={intercessionTopic}
                        onChange={e => setIntercessionTopic(e.target.value.slice(0, 200))}
                        rows={4}
                        placeholder="The climate crisis and those most affected..."
                        className="w-full px-4 py-3 rounded-xl border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] focus:outline-none resize-none"
                      />
                      <p className="text-xs text-muted-foreground/60 text-right mt-1">{intercessionTopic.length}/200</p>
                      <div className="text-xs text-muted-foreground/60 italic mt-2 space-y-0.5">
                        <p>"The vulnerable, the forgotten, those who suffer 🌿"</p>
                        <p>"The earth and every living thing 🌱"</p>
                        <p>"Someone we love who is struggling"</p>
                      </div>
                      <button
                        onClick={confirmCustomIntercession}
                        disabled={!intercessionTopic.trim()}
                        className="mt-4 w-full py-3 bg-[#6B8F71] text-white rounded-xl font-medium hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
                      >
                        Set this intention →
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* ── Name ───────────────────────────────────────────── */}
              {step === "name" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What is this practice called?</h2>
                    <p className="text-muted-foreground text-sm">Pre-filled from your template — edit freely.</p>
                  </div>
                  <input autoFocus type="text" value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && canNext() && goNext()}
                    placeholder="Morning Prayer, Evening Coffee, Sunday Sit..."
                    className="w-full text-xl md:text-2xl px-0 py-4 bg-transparent border-b-2 border-border focus:border-[#6B8F71] focus:outline-none transition-colors placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              {/* ── Intention ──────────────────────────────────────── */}
              {step === "intention" && (
                <div className="space-y-6 flex-1">
                  <div>
                    <h2 className="text-3xl font-semibold mb-2">What is the intention?</h2>
                    <p className="text-muted-foreground text-sm">The first thing everyone reads when they open their link.</p>
                  </div>
                  <textarea autoFocus value={intention}
                    onChange={e => setIntention(e.target.value)}
                    maxLength={280} rows={3}
                    placeholder="Write what holds this practice together..."
                    className="w-full px-0 py-3 bg-transparent border-b-2 border-border focus:border-[#6B8F71] focus:outline-none transition-colors resize-none text-lg placeholder:text-muted-foreground/40 font-serif italic"
                  />
                  <p className="text-right text-xs text-muted-foreground/50">{intention.length}/280</p>

                  {/* BCP full prayer preview */}
                  {selectedBcpPrayer && (
                    <div className="bg-[#F5EDD8] border border-[#c9b99a]/40 rounded-2xl p-4">
                      <details>
                        <summary className="text-xs font-medium text-[#4a3728] cursor-pointer">The full prayer ↓</summary>
                        <p className="mt-3 text-sm text-[#4a3728] italic leading-relaxed font-serif">{selectedBcpPrayer.text}</p>
                        <p className="text-xs text-[#4a3728]/60 mt-2">From the Book of Common Prayer</p>
                      </details>
                    </div>
                  )}
                </div>
              )}

              {/* ── Logging type ───────────────────────────────────── */}
              {step === "logging" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">How will your practice be held? 🌿</h2>
                    <p className="text-sm text-muted-foreground">Choose how members participate.</p>
                  </div>
                  <div className="grid gap-3">
                    {LOGGING_OPTIONS.map(opt => (
                      <button key={opt.type} onClick={() => setLoggingType(opt.type)}
                        className={`w-full text-left p-4 rounded-xl border-2 transition-all ${loggingType === opt.type ? "border-[#6B8F71] bg-[#6B8F71]/5" : "border-border hover:border-[#6B8F71]/30"}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{opt.icon}</span>
                          <div className="flex-1">
                            <p className="font-medium text-foreground text-sm">{opt.label}</p>
                            <p className="text-xs text-muted-foreground">{opt.description}</p>
                          </div>
                          {loggingType === opt.type && <span className="text-[#6B8F71]">✓</span>}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Timer duration */}
                  {loggingType === "timer" && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                      <label className="block text-sm font-medium text-foreground">Duration</label>
                      <div className="flex gap-2 flex-wrap">
                        {TIMER_DURATIONS.map(d => (
                          <button key={d} onClick={() => setTimerDuration(d)}
                            className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${timerDuration === d ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                            {d} min
                          </button>
                        ))}
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className={`relative w-10 h-5 rounded-full transition-colors ${hasReflectionAfterTimer ? "bg-[#6B8F71]" : "bg-border"}`}
                          onClick={() => setHasReflectionAfterTimer(v => !v)}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${hasReflectionAfterTimer ? "translate-x-5" : "translate-x-0.5"}`} />
                        </div>
                        <span className="text-sm text-muted-foreground">Add a reflection after the timer?</span>
                      </label>
                      {hasReflectionAfterTimer && (
                        <input type="text" value={reflectionPrompt}
                          onChange={e => setReflectionPrompt(e.target.value)}
                          placeholder="What arose in the stillness?"
                          className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] focus:outline-none"
                        />
                      )}
                    </motion.div>
                  )}

                  {/* Reflection prompt */}
                  {loggingType === "reflection" && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-sm font-medium text-foreground mb-2">Your reflection prompt</label>
                      <input autoFocus type="text" value={reflectionPrompt}
                        onChange={e => setReflectionPrompt(e.target.value)}
                        placeholder="What are you carrying into this day?"
                        className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:border-[#6B8F71] focus:ring-1 focus:ring-[#6B8F71] focus:outline-none"
                      />
                    </motion.div>
                  )}
                </div>
              )}

              {/* ── Schedule ───────────────────────────────────────── */}
              {step === "schedule" && (
                <div className="space-y-6 flex-1">
                  {isSpiritual ? (
                    <>
                      <div>
                        <h2 className="text-2xl font-semibold mb-1">When does this practice happen?</h2>
                        <p className="text-sm text-muted-foreground">Choose the time of day. Each person will set their own specific time.</p>
                      </div>

                      {/* Frequency */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">How often</label>
                        <div className="flex gap-3">
                          {(["daily", "weekly"] as Frequency[]).map(f => (
                            <button key={f} onClick={() => { setFrequency(f); if (f !== "weekly") setScheduledDays([]); }}
                              className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm capitalize transition-all ${frequency === f ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                              {f === "daily" ? "📅 Daily" : "🗓 Weekly"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Day pills for weekly */}
                      {frequency === "weekly" && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                          <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Which days</label>
                          <div className="flex flex-wrap gap-2">
                            {[["Mo","MO"],["Tu","TU"],["We","WE"],["Th","TH"],["Fr","FR"],["Sa","SA"],["Su","SU"]].map(([label, val]) => (
                              <button key={val} onClick={() => setScheduledDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])}
                                className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${scheduledDays.includes(val) ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Time of day cards */}
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-3">Time of day</label>
                        <div className="grid gap-3">
                          {TIME_OF_DAY_OPTIONS.map(opt => (
                            <button key={opt.id} onClick={() => setTimeOfDay(opt.id)}
                              className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${timeOfDay === opt.id ? "border-[#6B8F71] bg-[#6B8F71]/5" : "border-border hover:border-[#6B8F71]/30"}`}>
                              <div className="flex items-center gap-4">
                                <span className="text-2xl">{opt.emoji}</span>
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground text-sm">{opt.label}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">"{opt.sub}"</p>
                                  <p className="text-xs text-muted-foreground/60 mt-0.5">{opt.range}</p>
                                </div>
                                {timeOfDay === opt.id && <span className="text-[#6B8F71]">✓</span>}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground/60 italic">This describes the spirit of when the practice happens. Each person chooses their own specific time when they join.</p>
                    </>
                  ) : (
                    <>
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">When does the window open?</h2>
                    <p className="text-sm text-muted-foreground">Everyone has one hour to show up.</p>
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">How often</label>
                    <div className="flex gap-3">
                      {(["daily", "weekly"] as Frequency[]).map(f => (
                        <button key={f} onClick={() => { setFrequency(f); if (f !== "weekly") setScheduledDays([]); }}
                          className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm capitalize transition-all ${frequency === f ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                          {f === "daily" ? "📅 Daily" : "🗓 Weekly"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Day pills for weekly */}
                  {frequency === "weekly" && (
                    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Which days</label>
                      <div className="flex flex-wrap gap-2">
                        {[["Mo","MO"],["Tu","TU"],["We","WE"],["Th","TH"],["Fr","FR"],["Sa","SA"],["Su","SU"]].map(([label, val]) => (
                          <button key={val} onClick={() => setScheduledDays(prev => prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val])}
                            className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all ${scheduledDays.includes(val) ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/30 text-foreground"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Hour */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Hour</label>
                    <div className="grid grid-cols-6 gap-1.5">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(h => (
                        <button key={h} onClick={() => setScheduledHour(h)}
                          className={`py-2 rounded-lg border text-sm font-medium transition-all ${scheduledHour === h ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Minute */}
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">Minute</label>
                    <div className="flex gap-2">
                      {[0, 15, 30, 45].map(m => (
                        <button key={m} onClick={() => setScheduledMinute(m)}
                          className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${scheduledMinute === m ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                          :{String(m).padStart(2, "0")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AM/PM */}
                  <div className="flex gap-3">
                    {(["AM", "PM"] as const).map(p => (
                      <button key={p} onClick={() => setScheduledAmPm(p)}
                        className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${scheduledAmPm === p ? "border-[#6B8F71] bg-[#6B8F71]/5 text-[#4a6b50]" : "border-border hover:border-[#6B8F71]/20 text-foreground"}`}>
                        {p}
                      </button>
                    ))}
                  </div>

                  <p className="text-xs text-muted-foreground/60 italic">Members receive calendar invites in their own timezone.</p>
                    </>
                  )}
                </div>
              )}

              {/* ── Goal ───────────────────────────────────────────── */}
              {step === "goal" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">Set a milestone to tend toward 🌿</h2>
                    <p className="text-sm text-muted-foreground italic">Show up together and watch something grow.</p>
                  </div>
                  <div className="grid gap-3">
                    {GOAL_OPTIONS.map(g => (
                      <button key={g.days} onClick={() => setGoalDays(g.days)}
                        className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${goalDays === g.days ? "border-[#6B8F71] bg-[#6B8F71]/5" : "border-border hover:border-[#6B8F71]/30"}`}>
                        <div className="flex items-center gap-4">
                          <span className="text-3xl">{g.emoji}</span>
                          <div>
                            <p className="font-semibold text-foreground">{g.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{g.sub}</p>
                          </div>
                          {goalDays === g.days && <span className="ml-auto text-[#6B8F71]">✓</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Invite ─────────────────────────────────────────── */}
              {step === "invite" && (
                <div className="space-y-5 flex-1">
                  <div>
                    <h2 className="text-2xl font-semibold mb-1">Who will tend this practice with you? 🌿</h2>
                    <p className="text-sm text-muted-foreground">Each person gets their own link. No account needed to participate.</p>
                  </div>
                  <div className="space-y-3">
                    {participants.map((p, i) => (
                      <PersonRow key={i} person={p} index={i} showRemove={participants.length > 1}
                        onUpdate={(idx, f, v) => setParticipants(prev => { const n = [...prev]; n[idx][f] = v; return n; })}
                        onRemove={idx => setParticipants(prev => prev.filter((_, j) => j !== idx))}
                        onSelect={(idx, c) => setParticipants(prev => { const n = [...prev]; n[idx] = { name: c.name, email: c.email }; return n; })}
                      />
                    ))}
                  </div>
                  {participants.length < 19 && (
                    <button onClick={() => setParticipants(p => [...p, { name: "", email: "" }])}
                      className="text-sm text-[#6B8F71] hover:text-[#4a6b50] transition-colors flex items-center gap-1">
                      + Add another person
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground/60 italic mt-2">You can also add people later by sharing your practice link.</p>
                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* ── Next button (not shown for template or intercession main) ── */}
          {step !== "template" && step !== "intercession" && (
            <div className="mt-6 pt-4 border-t border-border/30">
              <button
                onClick={goNext}
                disabled={!canNext() || plantMutation.isPending}
                className="w-full py-4 rounded-2xl bg-[#6B8F71] text-white text-base font-semibold hover:bg-[#5a7a60] transition-colors disabled:opacity-40"
              >
                {plantMutation.isPending ? "Planting..." : step === "invite" ? "Plant this practice 🌿" : "Continue →"}
              </button>
              {plantMutation.isError && (
                <p className="text-xs text-destructive text-center mt-2">Something went wrong. Please try again.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
