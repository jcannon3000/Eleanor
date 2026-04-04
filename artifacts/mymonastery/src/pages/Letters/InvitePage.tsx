import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";

interface InviteInfo {
  correspondenceName: string;
  creatorName: string;
  groupType: string;
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
        const res = await fetch(`/api/letters/invite/${inviteToken}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
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
      const res = await fetch(`/api/letters/invite/${inviteToken}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      setCorrespondenceId(result.correspondenceId);
      setAccepted(true);
    } catch {
      // show nothing special, just let them retry
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#FAF6F0" }}>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#FAF6F0" }}>
        <p className="text-base text-muted-foreground">This invitation is no longer valid.</p>
      </div>
    );
  }

  if (!data) return null;

  if (accepted) {
    const writeUrl = correspondenceId
      ? `/letters/${correspondenceId}/write?token=${inviteToken}`
      : "/";
    const goUrl = correspondenceId
      ? `/letters/${correspondenceId}?token=${inviteToken}`
      : "/";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "#FAF6F0" }}>
        <div className="text-5xl mb-6">{"\u{1F4EE}"}</div>
        <p className="text-lg font-semibold mb-2" style={{ color: "#2C1810" }}>
          You're in. {"\u{1F33F}"}
        </p>
        <p className="text-sm text-muted-foreground mb-2 leading-relaxed">
          When {data.creatorName} writes you a letter, you'll get
          a calendar notification with a link to read it.
        </p>
        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          Write your first letter whenever you're ready. {"\u{1F4EE}"}
        </p>
        <button
          onClick={() => setLocation(writeUrl)}
          className="px-6 py-3 rounded-xl font-semibold text-sm mb-3"
          style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
        >
          Write your first letter {"\u{1F4EE}"}
        </button>
        <button
          onClick={() => setLocation(goUrl)}
          className="text-sm text-muted-foreground"
        >
          or view the correspondence &rarr;
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: "#FAF6F0" }}>
      <div className="max-w-md w-full">
        <div className="text-5xl mb-8">📮</div>

        <h1
          className="text-[22px] font-bold mb-4"
          style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {data.creatorName} wants to stay in touch.
        </h1>

        <p className="text-base text-muted-foreground mb-4 leading-relaxed">
          {data.creatorName} has invited you to exchange letters on Eleanor.
          Once every two weeks, you each write one letter. When a letter arrives,
          you'll get a calendar notification with a link to read it.
          Then write back when you're ready. A simple practice of staying close.
        </p>

        <p className="text-base italic mb-6" style={{ color: "#4A6FA5" }}>
          {data.correspondenceName}
        </p>

        {data.letterCount > 0 && (
          <p className="text-sm text-muted-foreground mb-6">
            {data.letterCount} letter{data.letterCount !== 1 ? "s have" : " has"} already been written.
          </p>
        )}

        {/* Form */}
        <div className="space-y-4 text-left mb-6">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">What should we call you?</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#e8e2d9] text-base focus:outline-none focus:border-[#4A6FA5] transition-colors"
              style={{ color: "#2C1810" }}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Your email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-[#e8e2d9] text-base focus:outline-none focus:border-[#4A6FA5] transition-colors"
              style={{ color: "#2C1810" }}
              placeholder="you@email.com"
            />
          </div>
        </div>

        <button
          onClick={handleAccept}
          disabled={!name.trim() || !email.includes("@") || isSubmitting}
          className="w-full py-3.5 rounded-2xl text-base font-semibold transition-opacity disabled:opacity-40"
          style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
        >
          {isSubmitting ? "Accepting..." : "Accept and start writing"}
        </button>
      </div>
    </div>
  );
}
