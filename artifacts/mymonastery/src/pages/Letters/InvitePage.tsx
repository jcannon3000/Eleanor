import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";

interface InviteInfo {
  correspondenceName: string;
  creatorName: string;
  type: string;
  memberCount: number;
  letterCount: number;
  alreadyJoined: boolean;
  memberEmail: string;
}

export default function LetterInvitePage() {
  const [, params] = useRoute("/letters/invite/:token");
  const [, setLocation] = useLocation();
  const inviteToken = params?.token ?? "";

  const [data, setData] = useState<InviteInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [correspondenceId, setCorrespondenceId] = useState<number | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    async function load() {
      try {
        // Try new phoebe endpoint first, fall back to legacy
        let res = await fetch(`/api/phoebe/invite/${inviteToken}`);
        if (res.status === 404) res = await fetch(`/api/letters/invite/${inviteToken}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed");
        const d: InviteInfo = await res.json();
        setData(d);
        if (d.memberEmail) setEmail(d.memberEmail);
        if (d.alreadyJoined) setAccepted(true);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [inviteToken]);

  async function handleAccept() {
    if (!name.trim() || !email.trim()) return;
    setIsSubmitting(true);
    try {
      let res = await fetch(`/api/phoebe/invite/${inviteToken}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) {
        res = await fetch(`/api/letters/invite/${inviteToken}/accept`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), email: email.trim() }),
        });
      }
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      setCorrespondenceId(result.correspondenceId);
      setAccepted(true);
    } catch {
      // silent — user can retry
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF6F0" }}>
        <div className="w-6 h-6 rounded-full border-2 border-[#4A6FA5] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center" style={{ background: "#FAF6F0" }}>
        <div>
          <p className="text-4xl mb-4">📮</p>
          <p className="text-base" style={{ color: "#6b6460" }}>This invitation is no longer valid.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isOneToOne = data.type === "one_to_one";

  if (accepted) {
    const writeUrl = correspondenceId
      ? `/letters/${correspondenceId}/write?token=${inviteToken}`
      : "/";
    const goUrl = correspondenceId
      ? `/letters/${correspondenceId}?token=${inviteToken}`
      : "/";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#FAF6F0" }}>
        <div className="text-5xl mb-6">📮</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
          You're in. 🌿
        </h1>
        <p className="text-sm mb-8 leading-relaxed max-w-sm" style={{ color: "#6b6460" }}>
          Write whenever you're ready.
        </p>
        <button
          onClick={() => setLocation(writeUrl)}
          className="px-8 py-4 rounded-2xl font-semibold text-base mb-4"
          style={{ background: "#4A6FA5", color: "#fff" }}
        >
          Write your first letter 📮
        </button>
        <button
          onClick={() => setLocation(goUrl)}
          className="text-sm"
          style={{ color: "#9a9390" }}
        >
          View the correspondence →
        </button>
        <p className="text-xs mt-12" style={{ color: "#9a9390" }}>Be together with Phoebe.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: "#FAF6F0" }}>
      <div className="max-w-sm w-full text-center">
        <div className="text-5xl mb-6">📮</div>

        <h1
          className="text-[22px] font-bold mb-4"
          style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {data.creatorName} wants to stay in touch.
        </h1>

        <p className="text-base mb-8 leading-relaxed" style={{ color: "#6b6460" }}>
          {isOneToOne
            ? `You've been invited to exchange letters — one every two weeks, alternating. You write, they respond, you write back. A conversation with room to breathe.`
            : `You've been invited to share weekly updates in ${data.correspondenceName}. Once a week, everyone shares what's been happening. 50 words or more.`
          }
        </p>

        {data.letterCount > 0 && (
          <p className="text-sm mb-6" style={{ color: "#9a9390" }}>
            {data.letterCount} letter{data.letterCount !== 1 ? "s" : ""} already written.
          </p>
        )}

        <div className="space-y-3 text-left mb-6">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={{ background: "#fff", border: "1px solid #D6CAB8", color: "#2C1810" }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            className="w-full px-4 py-3.5 rounded-xl text-sm focus:outline-none"
            style={{ background: "#fff", border: "1px solid #D6CAB8", color: "#2C1810" }}
          />
        </div>

        <button
          onClick={handleAccept}
          disabled={!name.trim() || !email.includes("@") || isSubmitting}
          className="w-full py-4 rounded-2xl text-base font-semibold disabled:opacity-40 transition-opacity"
          style={{ background: "#4A6FA5", color: "#fff" }}
        >
          {isSubmitting ? "Accepting..." : "Accept and start writing 📮"}
        </button>

        <p className="text-xs mt-10" style={{ color: "#9a9390" }}>
          No account needed. Just your words. 🌿<br />
          Be together with Phoebe.
        </p>
      </div>
    </div>
  );
}
