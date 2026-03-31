import { useState, useEffect, useRef } from "react";

interface Connection {
  name: string;
  email: string;
}

interface InviteStepProps {
  type: "practice" | "tradition";
  onPeopleChange: (people: { name: string; email: string }[]) => void;
}

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const CARD_W = 148;
const CARD_GAP = 12;
const CARD_STEP = CARD_W + CARD_GAP;
const SCROLL_SPEED = 35; // px per second

export function InviteStep({ type, onPeopleChange }: InviteStepProps) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [manualPeople, setManualPeople] = useState([{ name: "", email: "" }]);
  const [tickerPaused, setTickerPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/connections", { credentials: "include" })
      .then(r => r.ok ? r.json() : { connections: [] })
      .then(d => { setConnections(d.connections ?? []); setConnectionsLoading(false); })
      .catch(() => { setConnections([]); setConnectionsLoading(false); });
  }, []);

  const selectedConnections = connections.filter(c => selectedEmails.has(c.email.toLowerCase()));
  const validManual = manualPeople.filter(p => isValidEmail(p.email));
  const manualEmailsSet = new Set(validManual.map(p => p.email.toLowerCase()));
  const deduped = validManual.filter(p => !selectedEmails.has(p.email.toLowerCase()));
  const allInvited = [...selectedConnections, ...deduped];

  useEffect(() => {
    onPeopleChange(allInvited);
  }, [selectedEmails, manualPeople]);

  const toggleConnection = (email: string) => {
    const key = email.toLowerCase();
    setSelectedEmails(prev => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  const removePill = (email: string) => {
    const key = email.toLowerCase();
    setSelectedEmails(prev => { const n = new Set(prev); n.delete(key); return n; });
    setManualPeople(prev => {
      const next = prev.filter(p => p.email.toLowerCase() !== key);
      return next.length === 0 ? [{ name: "", email: "" }] : next;
    });
  };

  const updateManual = (i: number, field: "name" | "email", val: string) =>
    setManualPeople(prev => { const n = [...prev]; n[i] = { ...n[i], [field]: val }; return n; });

  const addManualRow = () => {
    if (manualPeople.length < 8) setManualPeople(prev => [...prev, { name: "", email: "" }]);
  };

  const removeManualRow = (i: number) => {
    if (manualPeople.length <= 1) setManualPeople([{ name: "", email: "" }]);
    else setManualPeople(prev => prev.filter((_, j) => j !== i));
  };

  const handlePointerDown = () => {
    setTickerPaused(true);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
  };
  const handlePointerUp = () => {
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = setTimeout(() => setTickerPaused(false), 3000);
  };

  const isTicker = connections.length > 3;
  const totalWidth = connections.length * CARD_STEP;
  const tickerDuration = totalWidth / SCROLL_SPEED;
  const animId = `ticker-${type}`;

  const ConnectionCard = ({ c, inTicker, idx }: { c: Connection; inTicker: boolean; idx: number }) => {
    const sel = selectedEmails.has(c.email.toLowerCase());
    return (
      <button
        key={`${c.email}-${idx}`}
        onClick={() => toggleConnection(c.email)}
        style={{ width: CARD_W, minWidth: CARD_W }}
        className={`flex-shrink-0 p-3 rounded-2xl border text-left transition-all ${
          sel ? "bg-[#6B8F71] border-[#6B8F71]" : "bg-card border-border/60 hover:border-[#6B8F71]/40 hover:bg-[#6B8F71]/5"
        }`}
      >
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-2 ${
          sel ? "bg-white/20 text-white" : "bg-[#6B8F71]/10 text-[#6B8F71]"
        }`}>
          {initials(c.name)}
        </div>
        <p className={`font-bold text-[13px] leading-tight truncate ${sel ? "text-white" : "text-foreground"}`}>
          {c.name.split(" ")[0]}
        </p>
        <p className={`text-[11px] truncate mt-0.5 ${sel ? "text-white/70" : "text-muted-foreground"}`}>
          {c.email}
        </p>
        <div className={`mt-2 text-[11px] font-semibold px-2 py-1 rounded-lg text-center ${
          sel
            ? "bg-white/20 text-white"
            : "border border-[#6B8F71] text-[#6B8F71]"
        }`}>
          {sel ? "Added ✓" : "+ Add"}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6 flex-1">
      {/* Section 1 — Recommended */}
      {!connectionsLoading && connections.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            From your practices and traditions 🌿
          </p>

          {isTicker ? (
            <div className="relative">
              <style>{`
                @keyframes ${animId} {
                  0% { transform: translateX(0); }
                  100% { transform: translateX(-${totalWidth}px); }
                }
              `}</style>
              <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none rounded-l-2xl" />
              <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none rounded-r-2xl" />
              <div
                className="overflow-hidden"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <div
                  className="flex"
                  style={{
                    gap: CARD_GAP,
                    animation: `${animId} ${tickerDuration}s linear infinite`,
                    animationPlayState: tickerPaused ? "paused" : "running",
                  }}
                >
                  {[...connections, ...connections].map((c, i) => (
                    <ConnectionCard key={`${c.email}-${i}`} c={c} inTicker idx={i} />
                  ))}
                </div>
              </div>
              {selectedEmails.size > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {selectedEmails.size} {selectedEmails.size === 1 ? "person" : "people"} added from your connections
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex gap-3">
                {connections.map((c, i) => (
                  <ConnectionCard key={c.email} c={c} inTicker={false} idx={i} />
                ))}
              </div>
              {selectedEmails.size > 0 && (
                <p className="text-xs text-muted-foreground mt-3">
                  {selectedEmails.size} {selectedEmails.size === 1 ? "person" : "people"} added from your connections
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section 2 — Manual */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Or invite someone new
        </p>
        <div className="space-y-2">
          {manualPeople.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={p.name}
                onChange={e => updateManual(i, "name", e.target.value)}
                placeholder="Name (optional)"
                className="flex-1 px-3 py-2.5 rounded-xl border border-border focus:border-[#6B8F71] outline-none bg-background text-sm"
              />
              <input
                type="email"
                value={p.email}
                onChange={e => updateManual(i, "email", e.target.value)}
                placeholder="Email"
                className="flex-1 px-3 py-2.5 rounded-xl border border-border focus:border-[#6B8F71] outline-none bg-background text-sm"
              />
              {manualPeople.length > 1 && (
                <button
                  onClick={() => removeManualRow(i)}
                  className="text-muted-foreground/50 hover:text-muted-foreground px-1 text-lg leading-none"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {manualPeople.length < 8 && (
          <button
            onClick={addManualRow}
            className="mt-3 text-sm text-[#6B8F71] hover:text-[#4a6b50] transition-colors flex items-center gap-1"
          >
            + Add another person
          </button>
        )}
      </div>

      {/* Section 3 — Summary pills */}
      {allInvited.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Inviting:</p>
          <div className="flex flex-wrap gap-2">
            {allInvited.map((p, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#6B8F71]/10 text-[#4a6b50] text-sm font-medium"
              >
                {p.name || p.email.split("@")[0]}
                <button
                  onClick={() => removePill(p.email)}
                  className="text-[#6B8F71]/60 hover:text-[#4a6b50] text-base leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
