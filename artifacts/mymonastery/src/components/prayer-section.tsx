import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PrayerRequest {
  id: number;
  body: string;
  ownerId: number;
  ownerName: string;
  isOwnRequest: boolean;
  isAnswered: boolean;
  answeredAt: string | null;
  prayerCount: number;
  iPrayed: boolean;
  createdAt: string;
}

export function PrayerSection() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(true);
  const [newBody, setNewBody] = useState("");

  const { data: requests = [], isLoading } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
  });

  const unansweredCount = requests.filter(r => !r.isAnswered).length;

  // Auto-collapse if empty (only affects initial state — user can toggle)
  // We set initial open state after data loads
  const sectionOpen = isOpen && (isLoading || requests.length > 0) || (!isLoading && requests.length === 0 ? false : isOpen);

  const submitMutation = useMutation({
    mutationFn: (body: string) => apiRequest("POST", "/api/prayer-requests", { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setNewBody("");
    },
  });

  const prayMutation = useMutation({
    mutationFn: (id: number) => apiRequest<{ iPrayed: boolean }>("POST", `/api/prayer-requests/${id}/pray`),
    onSuccess: (data, id) => {
      queryClient.setQueryData<PrayerRequest[]>(["/api/prayer-requests"], (old) =>
        old?.map(r => r.id === id ? { ...r, iPrayed: data.iPrayed, prayerCount: r.prayerCount + (data.iPrayed ? 1 : -1) } : r) ?? []
      );
    },
  });

  const answerMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/answer`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBody.trim();
    if (!trimmed) return;
    submitMutation.mutate(trimmed);
  };

  return (
    <div className="mt-6">
      {/* Section header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 py-2 group"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
            Held in prayer
          </span>
          {unansweredCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#6B8F71]/15 text-[#6B8F71] text-[11px] font-semibold">
              {unansweredCount}
            </span>
          )}
        </div>
        <div className="flex-1 h-px bg-border/40 mx-2" />
        <span className="text-muted-foreground/40 text-xs transition-transform duration-200" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="mt-3 space-y-3">
          {/* Submit new prayer request */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={newBody}
              onChange={e => setNewBody(e.target.value)}
              placeholder="Share a prayer request with your garden…"
              maxLength={1000}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-border/60 bg-card placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#6B8F71]/30 focus:border-[#6B8F71]/50 transition-all"
            />
            <button
              type="submit"
              disabled={!newBody.trim() || submitMutation.isPending}
              className="px-4 py-2.5 rounded-xl bg-[#6B8F71] text-white text-sm font-medium hover:bg-[#5a7a60] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            >
              {submitMutation.isPending ? "…" : "🙏"}
            </button>
          </form>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && requests.length === 0 && (
            <p className="text-sm text-muted-foreground/60 text-center py-4 italic">
              No prayer requests yet. Share what's on your heart.
            </p>
          )}

          {/* Prayer request cards */}
          {!isLoading && requests.map(request => (
            <div
              key={request.id}
              className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 ${
                request.isAnswered
                  ? "border-[#6B8F71]/30 bg-[#F5F8F5]"
                  : "border-[#c9b99a]/40 bg-[#FDFCF8]"
              }`}
            >
              {/* Left accent bar */}
              <div className={`w-1.5 flex-shrink-0 ${request.isAnswered ? "bg-[#6B8F71]/40" : "bg-[#C17F24]/60"}`} />

              <div className="flex-1 p-4 min-w-0">
                {/* Top row: owner + answered badge + delete */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-xs font-medium text-muted-foreground/70 shrink-0">
                      {request.isOwnRequest ? "Your request" : request.ownerName}
                    </span>
                    {request.isAnswered && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-[#6B8F71] font-medium bg-[#6B8F71]/10 rounded-full px-2 py-0.5 shrink-0">
                        Answered 🌿
                      </span>
                    )}
                  </div>
                  {request.isOwnRequest && (
                    <button
                      onClick={() => deleteMutation.mutate(request.id)}
                      disabled={deleteMutation.isPending}
                      aria-label="Delete prayer request"
                      className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors text-base leading-none shrink-0 disabled:opacity-40"
                    >
                      ×
                    </button>
                  )}
                </div>

                {/* Body */}
                <p className="text-sm text-foreground/80 leading-relaxed mb-3">
                  {request.body}
                </p>

                {/* Bottom row: pray button + prayer count + mark answered */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Pray toggle */}
                  {!request.isOwnRequest && (
                    <button
                      onClick={() => prayMutation.mutate(request.id)}
                      disabled={prayMutation.isPending}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${
                        request.iPrayed
                          ? "bg-[#6B8F71]/15 border-[#6B8F71]/40 text-[#6B8F71]"
                          : "bg-transparent border-border/50 text-muted-foreground hover:border-[#6B8F71]/40 hover:text-[#6B8F71]"
                      }`}
                    >
                      <span>{request.iPrayed ? "🙏" : "🤲"}</span>
                      <span>{request.iPrayed ? "Praying" : "Pray"}</span>
                    </button>
                  )}

                  {/* Prayer count */}
                  {request.prayerCount > 0 && (
                    <span className="text-xs text-muted-foreground/60">
                      {request.prayerCount} {request.prayerCount === 1 ? "person" : "people"} praying
                    </span>
                  )}

                  {/* Mark as answered */}
                  {request.isOwnRequest && !request.isAnswered && (
                    <button
                      onClick={() => answerMutation.mutate(request.id)}
                      disabled={answerMutation.isPending}
                      className="ml-auto text-xs text-[#6B8F71] hover:text-[#5a7a60] font-medium transition-colors disabled:opacity-50"
                    >
                      Mark as answered ✓
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
