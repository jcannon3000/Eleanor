import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

interface PrayerRequest {
  id: number;
  body: string;
  ownerId: number;
  ownerName: string | null;
  isOwnRequest: boolean;
  isAnswered: boolean;
  isAnonymous: boolean;
  closedAt: string | null;
  expiresAt: string | null;
  nearingExpiry: boolean;
  words: Array<{ authorName: string; content: string }>;
  myWord: string | null;
  createdAt: string;
}

export function PrayerSection() {
  const queryClient = useQueryClient();
  useAuth();

  const [isOpen, setIsOpen] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [pendingBody, setPendingBody] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [wordInputs, setWordInputs] = useState<Record<number, string>>({});
  const [releasedId, setReleasedId] = useState<number | null>(null);
  const [answeredId, setAnsweredId] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const { data: requests = [], isLoading } = useQuery<PrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
  });

  const submitMutation = useMutation({
    mutationFn: ({ body, isAnonymous }: { body: string; isAnonymous: boolean }) =>
      apiRequest("POST", "/api/prayer-requests", { body, isAnonymous }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setInputValue("");
      setPendingBody("");
      setIsAnonymous(false);
      setShowModal(false);
    },
  });

  const wordMutation = useMutation({
    mutationFn: ({ id, content }: { id: number; content: string }) =>
      apiRequest("POST", `/api/prayer-requests/${id}/word`, { content }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      setWordInputs(prev => ({ ...prev, [id]: "" }));
    },
  });

  const answerMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/answer`),
    onSuccess: (_data, id) => {
      setAnsweredId(id);
      setTimeout(() => {
        setAnsweredId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      }, 1500);
    },
  });

  const renewMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/renew`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/prayer-requests/${id}/release`),
    onSuccess: (_data, id) => {
      setReleasedId(id);
      setTimeout(() => {
        setReleasedId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      }, 1500);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/prayer-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const handleSendClick = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setPendingBody(trimmed);
    setShowModal(true);
  };

  const handleModalSubmit = () => {
    if (!pendingBody.trim()) return;
    submitMutation.mutate({ body: pendingBody.trim(), isAnonymous });
  };

  const handleModalCancel = () => {
    setShowModal(false);
    setPendingBody("");
    setIsAnonymous(false);
  };

  const handleRowClick = (id: number) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const handleWordSubmit = (id: number) => {
    const content = (wordInputs[id] || "").trim();
    if (!content) return;
    wordMutation.mutate({ id, content });
  };

  // Trap scroll when modal is open
  useEffect(() => {
    if (showModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showModal]);

  return (
    <div className="mt-6">
      {/* Section header */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 py-2 group"
        aria-expanded={isOpen}
      >
        <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
          Held in prayer
        </span>
        <div className="flex-1 h-px bg-border/40 mx-2" />
        <span
          className="text-muted-foreground/40 text-xs transition-transform duration-200"
          style={{ display: "inline-block", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="mt-3">
          {/* Input area */}
          <div className="flex gap-2 mb-4">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSendClick(); }}
              placeholder="Share a prayer request with your garden… 🌿"
              maxLength={1000}
              className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-border/60 bg-card placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#D4896A]/30 focus:border-[#D4896A]/50 transition-all"
            />
            <button
              type="button"
              onClick={handleSendClick}
              disabled={!inputValue.trim()}
              className="px-4 py-2.5 rounded-xl text-[#F7F0E6] text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
              style={{ backgroundColor: "#D4896A" }}
            >
              🙏
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-14 rounded bg-card border border-border/20 animate-pulse" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && requests.length === 0 && (
            <p className="text-sm text-muted-foreground/60 text-center py-6 italic">
              No prayer requests yet. Share what's on your heart. 🌿
            </p>
          )}

          {/* Prayer request rows */}
          {!isLoading && requests.length > 0 && (
            <div>
              {requests.map((request, idx) => {
                const isExpanded = expandedId === request.id;
                const isReleased = releasedId === request.id;
                const isAnsweredBrief = answeredId === request.id;
                const isLast = idx === requests.length - 1;

                return (
                  <div
                    key={request.id}
                    className={!isLast ? "border-b border-border/20" : ""}
                  >
                    {/* Row */}
                    <div
                      className="flex gap-0 cursor-pointer hover:bg-[#D4896A]/[0.04] transition-colors"
                      onClick={() => handleRowClick(request.id)}
                    >
                      {/* Blush accent bar */}
                      <div
                        className="w-0.5 self-stretch shrink-0"
                        style={{ backgroundColor: "#D4896A" }}
                      />

                      <div className="flex-1 p-4 pl-3 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Attribution */}
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-1">
                              {request.isAnonymous
                                ? "From someone in your garden 🌿"
                                : `From ${request.ownerName ?? "someone"}`}
                            </p>
                            {/* Body */}
                            <p className="text-sm leading-relaxed" style={{ color: "#2C1810" }}>
                              {request.body}
                            </p>
                          </div>

                          {/* Delete button for own requests */}
                          {request.isOwnRequest && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                deleteMutation.mutate(request.id);
                              }}
                              disabled={deleteMutation.isPending}
                              aria-label="Delete prayer request"
                              className="text-muted-foreground/40 hover:text-muted-foreground text-base leading-none shrink-0 ml-2 disabled:opacity-30 transition-colors"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div
                        className="pl-4 pr-4 pb-4"
                        style={{ borderLeft: "2px solid #D4896A", marginLeft: "2px" }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* Nearing expiry banner */}
                        {request.isOwnRequest && request.nearingExpiry && !isReleased && !isAnsweredBrief && (
                          <div
                            className="mb-3 px-3 py-2 rounded-lg text-xs italic"
                            style={{ backgroundColor: "#C17F24/10", color: "#C17F24", border: "1px solid #C17F24/30" }}
                          >
                            <span style={{ color: "#C17F24" }}>
                              This has been held for three days. Renew it or let it rest? 🌿
                            </span>
                            <div className="flex gap-3 mt-1.5 not-italic">
                              <button
                                type="button"
                                onClick={() => renewMutation.mutate(request.id)}
                                disabled={renewMutation.isPending}
                                className="underline underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-40"
                                style={{ color: "#C17F24" }}
                              >
                                Renew for three more days
                              </button>
                              <span style={{ color: "#C17F24/50" }}>·</span>
                              <button
                                type="button"
                                onClick={() => releaseMutation.mutate(request.id)}
                                disabled={releaseMutation.isPending}
                                className="underline underline-offset-2 transition-opacity hover:opacity-70 disabled:opacity-40"
                                style={{ color: "#C17F24" }}
                              >
                                Let it rest
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Released brief state */}
                        {isReleased && (
                          <p className="text-sm italic text-center py-2" style={{ color: "#6B8F71" }}>
                            🌾 Released with gratitude
                          </p>
                        )}

                        {/* Answered brief state */}
                        {isAnsweredBrief && (
                          <p className="text-sm italic text-center py-2" style={{ color: "#6B8F71" }}>
                            🌾 Held and answered
                          </p>
                        )}

                        {!isReleased && !isAnsweredBrief && (
                          <>
                            {/* Words from the garden */}
                            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 mb-2 mt-1">
                              Words from the garden:
                            </p>

                            {request.words.length === 0 ? (
                              <p className="text-sm italic mb-3" style={{ color: "#6B8F71" }}>
                                Be the first to hold this 🌿
                              </p>
                            ) : (
                              <div className="mb-3 space-y-1">
                                {request.words.map((w, i) => {
                                  const isMyWord = request.myWord && w.content === request.myWord;
                                  return (
                                    <p key={i} className="text-sm text-muted-foreground/70">
                                      <span className="font-medium text-muted-foreground/80">{w.authorName}</span>
                                      {": "}
                                      {w.content}
                                      {isMyWord && " 🌿"}
                                    </p>
                                  );
                                })}
                              </div>
                            )}

                            {/* Word input — hide if user already left a word */}
                            {!request.myWord && !request.isOwnRequest && (
                              <div className="flex gap-2 mt-2">
                                <input
                                  type="text"
                                  value={wordInputs[request.id] || ""}
                                  onChange={e =>
                                    setWordInputs(prev => ({
                                      ...prev,
                                      [request.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={e => {
                                    if (e.key === "Enter") handleWordSubmit(request.id);
                                  }}
                                  placeholder="Leave a word alongside this… 🌿"
                                  maxLength={120}
                                  className="flex-1 text-sm px-3 py-2 rounded-lg border border-border/50 bg-card placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-[#D4896A]/30 focus:border-[#D4896A]/40 transition-all"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleWordSubmit(request.id)}
                                  disabled={!(wordInputs[request.id] || "").trim() || wordMutation.isPending}
                                  className="px-3 py-2 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                                  style={{ backgroundColor: "#D4896A", color: "#F7F0E6" }}
                                >
                                  🙏
                                </button>
                              </div>
                            )}

                            {/* Own request actions */}
                            {request.isOwnRequest && (
                              <div className="flex justify-end mt-3">
                                <button
                                  type="button"
                                  onClick={() => answerMutation.mutate(request.id)}
                                  disabled={answerMutation.isPending}
                                  className="text-xs transition-opacity hover:opacity-70 disabled:opacity-40"
                                  style={{ color: "#6B8F71" }}
                                >
                                  Mark as answered ✓
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom sheet modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={e => { if (e.target === e.currentTarget) handleModalCancel(); }}
        >
          <div
            className="rounded-t-3xl shadow-2xl px-6 pt-6 pb-10"
            style={{ backgroundColor: "#F7F0E6" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <h2
              className="text-lg font-serif mb-4"
              style={{ color: "#2C1810" }}
            >
              Hold this with your garden 🌿
            </h2>

            {/* Request preview */}
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm leading-relaxed"
              style={{ backgroundColor: "rgba(44,24,16,0.05)", color: "#2C1810" }}
            >
              {pendingBody}
            </div>

            {/* Anonymous toggle */}
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm" style={{ color: "#2C1810" }}>
                Share anonymously
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={isAnonymous}
                onClick={() => setIsAnonymous(a => !a)}
                className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                style={{ backgroundColor: isAnonymous ? "#D4896A" : "#c5b8a8" }}
              >
                <span
                  className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                  style={{ transform: isAnonymous ? "translateX(22px)" : "translateX(4px)" }}
                />
              </button>
            </div>
            {isAnonymous && (
              <p className="text-xs italic mb-4" style={{ color: "#6B8F71" }}>
                (Your name won't be shown)
              </p>
            )}
            {!isAnonymous && <div className="mb-4" />}

            {/* Instructional copy */}
            <p className="text-xs italic mb-6" style={{ color: "#6B8F71" }}>
              Your garden will hold this for three days. On the third day, you can renew it or let it rest. 🌿
            </p>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleModalSubmit}
              disabled={submitMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#2C1810", color: "#F7F0E6" }}
            >
              {submitMutation.isPending ? "Sharing…" : "Share with my garden 🙏"}
            </button>

            {/* Cancel */}
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleModalCancel}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
              >
                Not yet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
