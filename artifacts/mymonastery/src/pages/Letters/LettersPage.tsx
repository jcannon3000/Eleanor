import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
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

  if (!currentPeriod.hasWrittenThisPeriod && currentPeriod.isLastThreeDays) {
    return (
      <span className="text-[13px]" style={{ color: "#C17F24" }}>
        Your letter is due
      </span>
    );
  }

  if (!currentPeriod.hasWrittenThisPeriod) {
    return (
      <span className="text-[13px] text-muted-foreground">
        Period {currentPeriod.periodNumber} · {currentPeriod.periodLabel}
      </span>
    );
  }

  const allWritten = currentPeriod.membersWritten.every((m) => m.hasWritten);
  if (allWritten) {
    return (
      <span className="text-[13px]" style={{ color: "#6B8F71" }}>
        All letters in
      </span>
    );
  }

  const waiting = currentPeriod.membersWritten.find(
    (m) => !m.hasWritten && m.name !== userName,
  );
  return (
    <span className="text-[13px] text-muted-foreground" style={{ color: "#6B8F71" }}>
      Waiting for {waiting?.name || "others"}...
    </span>
  );
}

export default function LettersPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: correspondences, isLoading } = useQuery<CorrespondenceItem[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

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
            <p className="text-base text-muted-foreground mb-1">No letters yet.</p>
            <p className="text-sm text-muted-foreground mb-8">
              Send your first letter.
            </p>
            <Link href="/letters/new">
              <button
                className="px-6 py-3.5 rounded-2xl text-base font-semibold"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                Send a letter
              </button>
            </Link>
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
            <Link href="/letters/new">
              <button
                className="px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold flex items-center gap-2"
                style={{ backgroundColor: "#4A6FA5", color: "#F7F0E6" }}
              >
                + Send a letter
              </button>
            </Link>
          </div>
        )}
      </div>
    </Layout>
  );
}
