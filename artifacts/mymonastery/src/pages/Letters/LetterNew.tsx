import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const STEP_LABELS = ["Type", "Who"] as const;
const TOTAL_STEPS = STEP_LABELS.length;

function ProgressBar({ step, goBack }: { step: number; goBack: () => void }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "#6B8F71" }}>
          Step {step} of {TOTAL_STEPS} — {STEP_LABELS[step - 1]}
        </span>
        {step > 1 && (
          <button onClick={goBack} className="text-xs text-[#2C1810]/50 hover:text-[#2C1810]">
            &larr; Back
          </button>
        )}
      </div>
      <div className="w-full h-1 bg-[#e8d5b8] rounded-full">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%`, backgroundColor: "#6B8F71" }}
        />
      </div>
    </div>
  );
}

function ContinueButton({ disabled, onClick, label }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <div className="flex justify-end mt-8">
      <button
        onClick={onClick}
        disabled={disabled}
        className="text-white rounded-2xl px-6 py-3 font-medium transition-colors disabled:opacity-40"
        style={{ backgroundColor: "#6B8F71" }}
      >
        {label || "Continue →"}
      </button>
    </div>
  );
}

export default function LetterNew() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const [groupType, setGroupType] = useState<"one_to_one" | "small_group">("one_to_one");
  const [members, setMembers] = useState<Array<{ email: string; name: string }>>([
    { email: "", name: "" },
  ]);
  const [error, setError] = useState("");

  // Get connections for suggestion chips
  const { data: momentsData } = useQuery<{ moments: Array<{ members: Array<{ name: string; email: string }> }> }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const connections = (() => {
    const seen = new Set<string>();
    const result: Array<{ name: string; email: string }> = [];
    for (const m of momentsData?.moments ?? []) {
      for (const member of m.members) {
        if (member.email && member.email !== user?.email && !seen.has(member.email)) {
          seen.add(member.email);
          result.push({ name: member.name || "", email: member.email });
        }
      }
    }
    return result;
  })();

  const createMutation = useMutation({
    mutationFn: (body: { name: string; groupType: string; members: Array<{ email: string; name?: string }> }) =>
      apiRequest<{ id: number }>("POST", "/api/letters/correspondences", body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      setLocation(`/letters/${data.id}`);
    },
    onError: (err: Error) => {
      try {
        const parsed = JSON.parse(err.message);
        setError(parsed.message || "Something went wrong.");
      } catch {
        setError(err.message || "Something went wrong.");
      }
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  function selectType(type: "one_to_one" | "small_group") {
    setGroupType(type);
    if (type === "small_group" && members.length < 2) {
      setMembers([{ email: "", name: "" }, { email: "", name: "" }]);
    } else if (type === "one_to_one") {
      setMembers([members[0] || { email: "", name: "" }]);
    }
    setStep(2);
  }

  function updateMember(idx: number, field: "email" | "name", value: string) {
    const updated = [...members];
    updated[idx] = { ...updated[idx], [field]: value };
    setMembers(updated);
  }

  function removeMember(idx: number) {
    setMembers(members.filter((_, i) => i !== idx));
  }

  function addMember() {
    const max = groupType === "small_group" ? 7 : 1;
    if (members.length < max) setMembers([...members, { email: "", name: "" }]);
  }

  function selectConnection(c: { name: string; email: string }) {
    if (groupType === "one_to_one") {
      setMembers([{ email: c.email, name: c.name }]);
    } else {
      const alreadyAdded = members.some((m) => m.email === c.email);
      if (!alreadyAdded) {
        const emptyIdx = members.findIndex((m) => !m.email);
        if (emptyIdx >= 0) {
          const updated = [...members];
          updated[emptyIdx] = { email: c.email, name: c.name };
          setMembers(updated);
        } else {
          setMembers([...members, { email: c.email, name: c.name }]);
        }
      }
    }
  }

  function handleCreate() {
    setError("");
    const validMembers = members.filter((m) => m.email.trim());
    // Auto-generate name
    const names = validMembers.map((m) => m.name || m.email.split("@")[0]);
    const autoName =
      groupType === "one_to_one"
        ? `Letters with ${names[0]}`
        : `Letters with ${names.join(", ")}`;

    createMutation.mutate({
      name: autoName,
      groupType,
      members: validMembers.map((m) => ({
        email: m.email.trim(),
        name: m.name.trim() || undefined,
      })),
    });
  }

  const hasValidEmails =
    groupType === "one_to_one"
      ? members[0]?.email?.includes("@")
      : members.filter((m) => m.email.includes("@")).length >= 2;

  return (
    <Layout>
      <div className="max-w-lg mx-auto w-full py-4">
        <ProgressBar step={step} goBack={() => setStep(step - 1)} />

        {/* ── STEP 1: Type ── */}
        {step === 1 && (
          <div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Send a letter
            </h1>
            <p className="text-sm text-muted-foreground mb-8">
              One letter every week. A practice of staying close.
            </p>

            <p className="text-sm font-medium mb-4" style={{ color: "#2C1810" }}>
              What kind of letter?
            </p>

            <div className="space-y-3">
              <button
                onClick={() => selectType("one_to_one")}
                className="w-full text-left p-5 rounded-2xl border-2 border-transparent bg-white hover:border-[#6B8F71]/30 transition-colors"
              >
                <p className="text-base font-semibold" style={{ color: "#2C1810" }}>
                  📮 A dialogue
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Just the two of you — one letter each, every week
                </p>
              </button>
              <button
                onClick={() => selectType("small_group")}
                className="w-full text-left p-5 rounded-2xl border-2 border-transparent bg-white hover:border-[#6B8F71]/30 transition-colors"
              >
                <p className="text-base font-semibold" style={{ color: "#2C1810" }}>
                  ✉️ A correspondence
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  A small group (3–8) — everyone writes to everyone
                </p>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Who ── */}
        {step === 2 && (
          <div>
            <h1
              className="text-2xl font-bold mb-2"
              style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {groupType === "one_to_one" ? "Who are you writing to?" : "Who's in this group?"}
            </h1>
            <p className="text-sm text-muted-foreground mb-6">
              {groupType === "one_to_one"
                ? "They'll get an invitation to start exchanging letters."
                : "Everyone will get an invitation to join."}
            </p>

            {/* Connection chips */}
            {connections.length > 0 && (
              <div className="mb-6">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Your connections</p>
                <div className="flex flex-wrap gap-2">
                  {connections.map((c) => {
                    const selected = members.some((m) => m.email === c.email);
                    return (
                      <button
                        key={c.email}
                        onClick={() => selectConnection(c)}
                        className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                        style={{
                          borderColor: selected ? "#6B8F71" : "#e8e2d9",
                          backgroundColor: selected ? "#6B8F71" : "white",
                          color: selected ? "white" : "#2C1810",
                        }}
                      >
                        {c.name || c.email}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Member inputs */}
            <div className="space-y-4">
              {members.map((m, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      placeholder="Name (optional)"
                      value={m.name}
                      onChange={(e) => updateMember(idx, "name", e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#e8e2d9] text-sm focus:outline-none focus:border-[#6B8F71] transition-colors"
                      style={{ color: "#2C1810" }}
                    />
                    <input
                      type="email"
                      placeholder="Email address"
                      value={m.email}
                      onChange={(e) => updateMember(idx, "email", e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#e8e2d9] text-sm focus:outline-none focus:border-[#6B8F71] transition-colors"
                      style={{ color: "#2C1810" }}
                    />
                  </div>
                  {members.length > 1 && (
                    <button
                      onClick={() => removeMember(idx)}
                      className="mt-2 text-muted-foreground hover:text-[#2C1810] text-lg"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>

            {groupType === "small_group" && members.length < 7 && (
              <button
                onClick={addMember}
                className="mt-3 text-sm font-medium"
                style={{ color: "#6B8F71" }}
              >
                + Add another person
              </button>
            )}

            {error && (
              <p className="mt-4 text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            <ContinueButton
              disabled={!hasValidEmails || createMutation.isPending}
              onClick={handleCreate}
              label={createMutation.isPending ? "Sending..." : "Send your first letter 📮"}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
