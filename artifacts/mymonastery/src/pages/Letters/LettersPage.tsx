import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

interface CorrespondenceMemberStatus {
  name: string;
  hasWritten: boolean;
}

interface CorrespondenceItem {
  id: number;
  name: string;
  groupType: string;
  members: Array<{ name: string | null; email: string; joinedAt: string | null; lastLetterAt: string | null }>;
  letterCount: number;
  unreadCount: number;
  currentPeriod: {
    periodNumber: number;
    periodStart: string;
    periodEnd: string;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    membersWritten: CorrespondenceMemberStatus[];
    isLastThreeDays: boolean;
  };
}

function PeriodStatus({ item, userName }: { item: CorrespondenceItem; userName: string }) {
  const { currentPeriod } = item;

  // Unread letter available
  if (item.unreadCount > 0) {
    const writer = currentPeriod.membersWritten.find(
      (m) => m.hasWritten && m.name !== userName,
    );
    return (
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: "#4A6FA5",
            animation: "letterPulse 2s ease-in-out infinite",
          }}
        />
        <span className="text-[13px] italic" style={{ color: "#4A6FA5" }}>
          {writer?.name || "Someone"} wrote
        </span>
      </div>
    );
  }

  // You haven't written, last 3 days
  if (!currentPeriod.hasWrittenThisPeriod && currentPeriod.isLastThreeDays) {
    return (
      <span className="text-[13px]" style={{ color: "#C17F24" }}>
        Your letter is due
      </span>
    );
  }

  // You haven't written, not last 3 days
  if (!currentPeriod.hasWrittenThisPeriod) {
    return (
      <span className="text-[13px] text-muted-foreground">
        Period {currentPeriod.periodNumber} · {currentPeriod.periodLabel}
      </span>
    );
  }

  // Everyone has written
  const allWritten = currentPeriod.membersWritten.every((m) => m.hasWritten);
  if (allWritten) {
    return (
      <span className="text-[13px]" style={{ color: "#6B8F71" }}>
        All letters in
      </span>
    );
  }

  // You've written, waiting on others
  const waiting = currentPeriod.membersWritten.find(
    (m) => !m.hasWritten && m.name !== userName,
  );
  return (
    <span className="text-[13px] text-muted-foreground" style={{ color: "#6B8F71" }}>
      Waiting for {waiting?.name || "others"}...
    </span>
  );
}

// ─── Creation Sheet ─────────────────────────────────────────────────────────

function CreationSheet({
  open,
  onClose,
  connections,
}: {
  open: boolean;
  onClose: () => void;
  connections: Array<{ name: string; email: string }>;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [groupType, setGroupType] = useState<"one_to_one" | "small_group">("one_to_one");
  const [members, setMembers] = useState<Array<{ email: string; name: string }>>([
    { email: "", name: "" },
  ]);
  const [corrName, setCorrName] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: { name: string; groupType: string; members: Array<{ email: string; name?: string }> }) =>
      apiRequest<{ id: number }>("POST", "/api/letters/correspondences", body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/letters/correspondences"] });
      onClose();
      setLocation(`/letters/${data.id}`);
    },
  });

  useEffect(() => {
    if (!open) {
      setStep(1);
      setGroupType("one_to_one");
      setMembers([{ email: "", name: "" }]);
      setCorrName("");
    }
  }, [open]);

  function selectType(type: "one_to_one" | "small_group") {
    setGroupType(type);
    if (type === "small_group" && members.length < 2) {
      setMembers([...members, { email: "", name: "" }]);
    }
    setStep(2);
  }

  function addMember() {
    if (members.length < 4) setMembers([...members, { email: "", name: "" }]);
  }

  function removeMember(idx: number) {
    setMembers(members.filter((_, i) => i !== idx));
  }

  function updateMember(idx: number, field: "email" | "name", value: string) {
    const updated = [...members];
    updated[idx] = { ...updated[idx], [field]: value };
    setMembers(updated);
  }

  function selectConnection(c: { name: string; email: string }) {
    if (groupType === "one_to_one") {
      setMembers([{ email: c.email, name: c.name }]);
    } else {
      const alreadyAdded = members.some((m) => m.email === c.email);
      if (!alreadyAdded) {
        const emptyIdx = members.findIndex((m) => !m.email);
        if (emptyIdx >= 0) {
          updateMember(emptyIdx, "email", c.email);
          updateMember(emptyIdx, "name", c.name);
        } else if (members.length < 4) {
          setMembers([...members, { email: c.email, name: c.name }]);
        }
      }
    }
  }

  function goToStep3() {
    const firstName = members[0]?.name || members[0]?.email?.split("@")[0] || "";
    setCorrName(
      groupType === "one_to_one" ? `Letters with ${firstName}` : "Our Letters",
    );
    setStep(3);
  }

  function handleCreate() {
    const validMembers = members.filter((m) => m.email.trim());
    createMutation.mutate({
      name: corrName.trim(),
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

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#FAF6F0] rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
      >
        <div className="p-6 pb-8">
          <div className="w-10 h-1 rounded-full bg-[#2C1810]/20 mx-auto mb-6" />

          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold mb-6" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                Who are you writing to?
              </h2>
              <div className="space-y-3">
                <button
                  onClick={() => selectType("one_to_one")}
                  className="w-full text-left p-5 rounded-2xl border-2 border-transparent hover:border-[#4A6FA5]/30 bg-white transition-colors"
                >
                  <p className="text-base font-semibold" style={{ color: "#2C1810" }}>Just the two of us</p>
                  <p className="text-sm text-muted-foreground mt-0.5">One letter each, every two weeks</p>
                </button>
                <button
                  onClick={() => selectType("small_group")}
                  className="w-full text-left p-5 rounded-2xl border-2 border-transparent hover:border-[#4A6FA5]/30 bg-white transition-colors"
                >
                  <p className="text-base font-semibold" style={{ color: "#2C1810" }}>A small group</p>
                  <p className="text-sm text-muted-foreground mt-0.5">Everyone writes to everyone</p>
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold mb-4" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                {groupType === "one_to_one" ? "Who do you want to write to?" : "Who's in this group?"}
              </h2>

              {connections.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Your connections</p>
                  <div className="flex flex-wrap gap-2">
                    {connections.map((c) => (
                      <button
                        key={c.email}
                        onClick={() => selectConnection(c)}
                        className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                        style={{
                          borderColor: members.some((m) => m.email === c.email)
                            ? "#4A6FA5"
                            : "#e8e2d9",
                          backgroundColor: members.some((m) => m.email === c.email)
                            ? "#4A6FA5"
                            : "white",
                          color: members.some((m) => m.email === c.email)
                            ? "white"
                            : "#2C1810",
                        }}
                      >
                        {c.name || c.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {members.map((m, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Name (optional)"
                        value={m.name}
                        onChange={(e) => updateMember(idx, "name", e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#e8e2d9] text-sm focus:outline-none focus:border-[#4A6FA5] transition-colors"
                        style={{ color: "#2C1810" }}
                      />
                      <input
                        type="email"
                        placeholder="Email address"
                        value={m.email}
                        onChange={(e) => updateMember(idx, "email", e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl bg-white border border-[#e8e2d9] text-sm focus:outline-none focus:border-[#4A6FA5] transition-colors"
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

              {groupType === "small_group" && members.length < 4 && (
                <button
                  onClick={addMember}
                  className="mt-3 text-sm font-medium"
                  style={{ color: "#4A6FA5" }}
                >
                  + Add another person
                </button>
              )}

              <button
                onClick={goToStep3}
                disabled={!hasValidEmails}
                className="w-full mt-6 py-3.5 rounded-2xl text-base font-semibold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                Continue
              </button>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-xl font-bold mb-4" style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}>
                What will you call this?
              </h2>
              <input
                type="text"
                value={corrName}
                onChange={(e) => setCorrName(e.target.value)}
                maxLength={60}
                className="w-full px-4 py-3 bg-transparent border-b-2 text-lg focus:outline-none transition-colors"
                style={{
                  color: "#2C1810",
                  borderColor: "#4A6FA5",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              />
              <button
                onClick={handleCreate}
                disabled={!corrName.trim() || createMutation.isPending}
                className="w-full mt-6 py-3.5 rounded-2xl text-base font-semibold transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                {createMutation.isPending ? "Starting..." : "Start writing"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function LettersPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: correspondences, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  // Get connections from practices + traditions for suggestion chips
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

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const items = correspondences ?? [];
  const isEmpty = !isLoading && items.length === 0;

  return (
    <Layout>
      <style>{`
        @keyframes letterPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <div className="flex flex-col w-full pb-24">
        {/* Header */}
        <div className="mb-6">
          <h1
            className="text-[28px] font-bold"
            style={{ color: "#2C1810", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Letters
          </h1>
          <p className="text-[15px] italic mt-1" style={{ color: "#6B8F71" }}>
            One letter every two weeks. A practice of staying close.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : isEmpty ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-16"
          >
            <div className="text-5xl mb-6">📮</div>
            <p className="text-base text-muted-foreground mb-1">No correspondences yet.</p>
            <p className="text-sm text-muted-foreground mb-8">
              Start one and write your first letter.
            </p>
            <button
              onClick={() => setSheetOpen(true)}
              className="px-6 py-3.5 rounded-2xl text-base font-semibold"
              style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
            >
              Start a correspondence
            </button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-0"
          >
            {items.map((item) => {
              const otherMembers = item.members
                .filter((m) => m.email !== user.email)
                .map((m) => m.name || m.email.split("@")[0])
                .join(", ");

              return (
                <Link key={item.id} href={`/letters/${item.id}`}>
                  <div
                    className="flex items-center py-4 border-b border-border/40 hover:bg-[#F7F0E6]/50 transition-colors cursor-pointer"
                  >
                    <div
                      className="w-0.5 self-stretch rounded-full mr-4 flex-shrink-0"
                      style={{ backgroundColor: "#4A6FA5" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[17px] font-bold truncate" style={{ color: "#2C1810" }}>
                        {item.name}
                      </p>
                      <p className="text-[14px] text-muted-foreground truncate">
                        with {otherMembers}
                      </p>
                    </div>
                    <div className="flex-shrink-0 ml-3 text-right">
                      <PeriodStatus item={item} userName={user.name} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </motion.div>
        )}

        {/* Floating + button */}
        {!isEmpty && (
          <div className="fixed bottom-6 right-6 z-30">
            <button
              onClick={() => setSheetOpen(true)}
              className="px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2"
              style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
            >
              + Start a correspondence
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {sheetOpen && (
          <CreationSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            connections={connections}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
